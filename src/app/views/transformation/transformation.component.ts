import { Component, OnInit } from '@angular/core';
import { IInterface } from '~/app/models/interface.model';
import { FormControl, Validators } from '@angular/forms';
import { InterfaceService } from '~/app/services/interface.service';
import { merge } from 'rxjs';
import { MappingService } from '~/app/services/mapping.service';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { GenericDialog, ButtonType } from '~/app/utils/generic-dialog/generic-dialog.component';
import { ValidationError } from '~/app/utils/errors/validation-error';
import { IMappingPair, MappingType } from '~/app/models/mapping.model';
import { ValidationService } from '~/app/services/validation.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-transformation',
  templateUrl: './transformation.component.html',
  styleUrls: ['./transformation.component.scss']
})
export class TransformationComponent implements OnInit {

  public interfaces: Array<IInterface>;

  public mappingSource: FormControl;
  public mappingTarget: FormControl;

  public requestMappingPairs: Array<IMappingPair>;
  public responseMappingPairs: Array<IMappingPair>;

  public mappingError: ValidationError;

  constructor(private interfaceService: InterfaceService, private mappingService: MappingService, private validationService: ValidationService, private dialog: MatDialog) { }

  public async ngOnInit() {
    this.mappingSource = new FormControl(undefined, Validators.required);
    this.mappingTarget = new FormControl(undefined, Validators.required);

    this.requestMappingPairs = new Array<IMappingPair>();
    this.responseMappingPairs = new Array<IMappingPair>();

    this.interfaces = await this.interfaceService.getInterfaces();

    const dualObserver = merge(this.mappingSource.valueChanges, this.mappingTarget.valueChanges);
    dualObserver.subscribe(() => this.initializeMapping());
  }

  private async initializeMapping() {
    const source = this.mappingSource.value as IInterface;
    const target = this.mappingTarget.value as IInterface;
    if (source && target) {
      const { request, response } = await this.mappingService.buildMappingPairs(source, target);

      this.requestMappingPairs.splice(0);
      this.requestMappingPairs.push(...request);

      this.responseMappingPairs.splice(0);
      this.responseMappingPairs.push(...response);
    }
  }

  public async finishMapping() {
    const mapping = this.mappingService.buildMapping(this.mappingSource.value, this.mappingTarget.value, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

    try {
      this.validationService.validateMapping(this.mappingSource.value, this.mappingTarget.value, mapping);

      this.mappingError = undefined;
      await this.mappingService.createMapping(mapping);

      this.showSuccessDialog()
    } catch (err) {
      if (err instanceof ValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

  private showSuccessDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Mapping Success",
        content: "The mapping was successsfully created.",
        buttons: [ButtonType.OK]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.ngOnInit();
    });
  }
}
