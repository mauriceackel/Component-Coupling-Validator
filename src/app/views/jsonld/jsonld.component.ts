import { Component, OnInit, OnDestroy } from '@angular/core';
import { IInterface } from '~/app/models/interface.model';
import { FormControl, Validators } from '@angular/forms';
import { InterfaceService } from '~/app/services/interface.service';
import { merge } from 'rxjs';
import { IMappingPair, MappingType } from '~/app/models/mapping.model';
import { ValidationError } from '~/app/utils/errors/validation-error';
import { MappingService } from '~/app/services/mapping.service';
import { ValidationService } from '~/app/services/validation.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GenericDialog, ButtonType } from '~/app/utils/generic-dialog/generic-dialog.component';
import { JsonldService } from '~/app/services/jsonld.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TaskService } from '~/app/services/task.service';

@Component({
  selector: 'app-jsonld',
  templateUrl: './jsonld.component.html',
  styleUrls: ['./jsonld.component.scss']
})
export class JsonldComponent implements OnInit, OnDestroy {

  public interfaces: Array<IInterface>;

  public mappingSource: FormControl;
  public mappingTarget: FormControl;

  public requestMappingPairs: Array<IMappingPair>;
  public responseMappingPairs: Array<IMappingPair>;

  public mappingError: ValidationError;

  constructor(
    private interfaceService: InterfaceService,
    private mappingService: MappingService,
    private validationService: ValidationService,
    private dialog: MatDialog,
    private jsonldService: JsonldService,
    private activatedRoute: ActivatedRoute,
    private taskService: TaskService,
    private router: Router
  ) { }

  public async ngOnInit() {
    this.mappingSource = new FormControl(undefined, Validators.required);
    this.mappingTarget = new FormControl(undefined, Validators.required);

    this.requestMappingPairs = new Array<IMappingPair>();
    this.responseMappingPairs = new Array<IMappingPair>();

    this.interfaces = await this.interfaceService.getInterfaces();

    const dualObserver = merge(this.mappingSource.valueChanges, this.mappingTarget.valueChanges);
    dualObserver.subscribe(() => this.initializeMapping());

    this.activatedRoute.queryParams.subscribe(params => {
      this.mappingSource.setValue(this.interfaces.find(i => i.id === params["sourceId"]));
      this.mappingTarget.setValue(this.interfaces.find(i => i.id === params["targetId"]));
    });
  }

  public ngOnDestroy() {
    this.taskService.pauseTask();
  }

  private async initializeMapping() {
    const source = this.mappingSource.value as IInterface;
    const target = this.mappingTarget.value as IInterface;
    if (source && target) {
      const { request, response } = await this.jsonldService.buildMappingPairs(source, target);

      this.requestMappingPairs.splice(0);
      this.requestMappingPairs.push(...request);

      this.responseMappingPairs.splice(0);
      this.responseMappingPairs.push(...response);
    }
  }

  public save(jsonLdContext: any, iface: IInterface, ref: { jsonLdContext: any }) {
    if (iface) {
      ref.jsonLdContext = jsonLdContext;
      this.interfaceService.updateInterface(iface);
    }
    this.initializeMapping();
  }

  public reset() {
    this.router.navigate([], {
      queryParams: {
        sourceId: null,
        targetId: null,
      },
      queryParamsHandling: 'merge'
    });
    this.taskService.abortTask();
    this.ngOnInit();
  }

  public async finishMapping() {
    const mapping = this.mappingService.buildMapping(this.mappingSource.value, this.mappingTarget.value, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

    try {
      this.validationService.validateMapping(this.mappingSource.value, this.mappingTarget.value, mapping);

      this.mappingError = undefined;
      await this.mappingService.createMapping(mapping);

      if(this.taskService.TaskRunning) {
        this.taskService.finishTask();
        this.showTaskSuccessDialog();
      } else {
        this.showSuccessDialog();
      }

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
      this.reset();
    });
  }

  private showTaskSuccessDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Task Finished",
        content: "The task was finished successfully.",
        buttons: [ButtonType.OK]
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.router.navigate(["/home"])
    });
  }

}
