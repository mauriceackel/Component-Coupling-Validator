import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { Router } from '@angular/router';
import { merge, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { IAsyncApi } from '~/app/models/asyncapi.model';
import { IAsyncApiInterface } from '~/app/models/asyncapi-interface.model';
import { IMappingPair, MappingType, MappingDirection } from '~/app/models/mapping.model';
import { ApiService } from '~/app/services/api.service';
import { MappingService } from '~/app/services/mapping.service';
import { TaskService } from '~/app/services/task.service';
import { ValidationService } from '~/app/services/validation.service';
import { OpenApiValidationError } from '~/app/utils/errors/validation-error';
import { ButtonType, GenericDialog } from '~/app/utils/generic-dialog/generic-dialog.component';
import { getOperationTemplates, getMessageSchema, IAsyncApiOperationTemplate } from '~/app/utils/asyncapi-parser';
import { AdapterService, AdapterType } from '~/app/services/adapter.service';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ProgressIndicatorComponent } from '~/app/components/progress-indicator/progress-indicator.component';

@Component({
  selector: 'app-asyncapi-transformation',
  templateUrl: './transformation.component.html',
  styleUrls: ['./transformation.component.scss']
})
export class TransformationComponent implements OnInit, OnDestroy {

  public apis: Array<IAsyncApi>;

  public targets = new FormArray([]);

  public inputForm = new FormGroup({
    'publish': new FormControl(false),
    'mS': new FormControl(undefined, Validators.required),
    'mSO': new FormControl(undefined, Validators.required),
    'targets': this.targets,
  });

  public mappingSource: IAsyncApiInterface;
  public mappingTargets: { [key: string]: IAsyncApiInterface };

  public sourceOperations: Array<IAsyncApiOperationTemplate>;
  public targetOperations: Array<Array<IAsyncApiOperationTemplate>>;

  public sourceMessageBody: any;
  public targetMessageBodies: any;

  public mappingPairs: Array<IMappingPair>;

  public mappingError: OpenApiValidationError;

  private subscriptions: Array<Subscription>;

  private spinnerRef: OverlayRef = this.cdkSpinnerCreate();

  constructor(
    private apiService: ApiService,
    private mappingService: MappingService,
    private adapterService: AdapterService,
    private validationService: ValidationService,
    private dialog: MatDialog,
    private taskService: TaskService,
    private router: Router,
    private overlay: Overlay
  ) { }

  public async ngOnInit() {
    this.mappingPairs = new Array<IMappingPair>();

    this.mappingSource = undefined;
    this.mappingTargets = undefined;

    this.sourceOperations = [];
    this.targetOperations = [];

    this.sourceMessageBody = undefined;
    this.targetMessageBodies = undefined;

    this.mappingError = undefined;
    this.subscriptions = new Array<Subscription>();

    this.apis = await this.apiService.getAsyncApis();

    this.subscriptions.push(this.inputForm.valueChanges.subscribe(() => this.initializeMapping()));

    const sourceChanges = merge(this.inputForm.get('mS').valueChanges, this.inputForm.get('mSO').valueChanges).pipe(debounceTime(0));
    this.subscriptions.push(sourceChanges.subscribe(async () => {
      const source = this.parseSource();
      this.mappingSource = source;

      if (source) {
        this.sourceMessageBody = {
          [`${source.api.id}_${source.operationId}`]: await getMessageSchema(source.api, { operationId: source.operationId, url: source.url })
        };
      }
    }));
    this.subscriptions.push(this.inputForm.get('mS').valueChanges.subscribe(async (val: IAsyncApi) => this.sourceOperations = val && await getOperationTemplates(val, this.inputForm.get('publish').value)));

    this.subscriptions.push(this.targets.valueChanges.subscribe(async () => {
      const targets = this.parseTargets();
      this.mappingTargets = targets;

      const message = {};

      for (const [key, value] of Object.entries(targets || {})) {
        message[key] = await getMessageSchema(value.api, { operationId: value.operationId, url: value.url })
      }

      this.targetMessageBodies = message;
    }))

    this.subscriptions.push(this.inputForm.get('publish').valueChanges.subscribe(async (publish: boolean) => {
      const val = this.inputForm.get('mS').value;
      this.sourceOperations = val && await getOperationTemplates(val, publish);
    }));

    this.targets.clear();
    this.addTarget();
  }

  public ngOnDestroy() {
    this.taskService.pauseTask();
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  public addTarget() {
    const group = new FormGroup({
      'mT': new FormControl(undefined, Validators.required),
      'mTO': new FormControl(undefined, Validators.required),
      'operations': new FormControl([])
    })
    this.subscriptions.push(
      group.get('mT').valueChanges.subscribe(async (val: IAsyncApi) => group.get('operations').setValue(val && await getOperationTemplates(val, this.inputForm.get('publish').value)))
    )
    this.subscriptions.push(this.inputForm.get('publish').valueChanges.subscribe(async (publish: boolean) => {
      const val = group.get('mT').value;
      group.get('operations').setValue(val && await getOperationTemplates(val, publish));
    }));
    this.targets.push(group);
  }

  public removeTarget(index: number) {
    this.targets.removeAt(index);
  }

  private parseSource(): IAsyncApiInterface {
    if (!(this.inputForm.get('mS').valid && this.inputForm.get('mSO').valid)) return undefined;

    const data = this.inputForm.value;
    return {
      api: data.mS,
      operationId: data.mSO.operationId,
      url: data.mSO.url
    }
  }

  private parseTargets(): { [key: string]: IAsyncApiInterface } {
    if (!(this.targets.valid)) return undefined;

    const targets = this.targets.value as Array<{ mT: IAsyncApi, mTO: IAsyncApiOperationTemplate }>;
    return targets.reduce((obj, target) => ({
      ...obj,
      [`${target.mT.id}_${target.mTO.operationId}`]: {
        api: target.mT,
        operationId: target.mTO.operationId,
        url: target.mTO.url
      } as IAsyncApiInterface
    }), {})
  }

  private cdkSpinnerCreate() {
    return this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'dark-backdrop',
      positionStrategy: this.overlay.position()
        .global()
        .centerHorizontally()
        .centerVertically()
    })
  }

  showSpinner() {
    this.spinnerRef.attach(new ComponentPortal(ProgressIndicatorComponent))
  }

  stopSpinner() {
    this.spinnerRef.detach();
  }

  private async initializeMapping() {
    if (!this.inputForm.valid) return;

    this.showSpinner();

    const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;

    const message = await this.mappingService.buildAsyncApiMappingPairs(this.parseSource(), this.parseTargets(), direction);

    this.mappingPairs.splice(0);
    this.mappingPairs.push(...message);

    this.stopSpinner();
  }

  mapSame() {
    if (this.inputForm.get('publish').value) {
      //Output
      const mappingPairs = this.mappingService.buildSameMappingPairs(this.sourceMessageBody, this.targetMessageBodies);
      mappingPairs.forEach(p => {
        if (!this.mappingPairs.find(e => e.required.join('.') === p.required.join('.'))) {
          this.mappingPairs.push(p);
        }
      })
    } else {
      //Input
      const mappingPairs = this.mappingService.buildSameMappingPairs(this.targetMessageBodies, this.sourceMessageBody, true);
      mappingPairs.forEach(p => {
        if (!this.mappingPairs.find(e => e.required.join('.') === p.required.join('.') && e.provided[0][0] === p.provided[0][0])) {
          this.mappingPairs.push(p);
        }
      })
    }
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
    this.subscriptions.forEach(s => s.unsubscribe());
    this.inputForm.reset();
    this.ngOnInit();
  }

  public async buildAdapter() {
    try {
      if (this.mappingPairs.some(mp => !mp.mappingCode)) {
        throw new OpenApiValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;

      const source = this.parseSource();
      const targets = this.parseTargets();
      const mapping = this.mappingService.buildAsyncApiMapping(source, targets, this.mappingPairs, direction, MappingType.TRANSFORMATION);

      await this.validationService.validateAsyncApiMappingComplete(source, targets, mapping, direction);

      this.mappingError = undefined;

      const downloadLink = await this.adapterService.createAsyncApiAdapter(mapping, AdapterType.JAVASCRIPT);

      window.open(downloadLink, "_blank");
    } catch (err) {
      if (err instanceof OpenApiValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

  public async finishMapping() {
    try {
      if (this.mappingPairs.some(mp => !mp.mappingCode)) {
        throw new OpenApiValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;

      const source = this.parseSource();
      const targets = this.parseTargets();
      const mapping = this.mappingService.buildAsyncApiMapping(source, targets, this.mappingPairs, direction, MappingType.TRANSFORMATION);

      await this.validationService.validateAsyncApiMappingComplete(source, targets, mapping, direction);

      this.mappingError = undefined;
      await this.mappingService.createAsyncApiMapping(mapping);

      if (this.taskService.TaskRunning) {
        this.taskService.finishTask();
        this.showTaskSuccessDialog();
      } else {
        this.showSuccessDialog();
      }

    } catch (err) {
      if (err instanceof OpenApiValidationError) {
        this.mappingError = err;
        return;
      }
      this.showErrorDialog();
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

  private showErrorDialog() {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Mapping Error",
        content: "An error occured while saving the mapping. This is most likely because the already exists an identical mapping. However, if you keep experiencing this issue, please contact us.",
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