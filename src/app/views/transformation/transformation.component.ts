import { Component, OnDestroy, OnInit, ViewChild, EventEmitter } from '@angular/core';
import { FormControl, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ActivatedRoute, Router } from '@angular/router';
import { merge, Subscription, combineLatest, pipe } from 'rxjs';
import { debounceTime, map, tap, switchMap } from 'rxjs/operators';
import { IApi } from '~/app/models/api.model';
import { IInterface } from '~/app/models/interface.model';
import { IMappingPair, MappingType } from '~/app/models/mapping.model';
import { ApiService } from '~/app/services/api.service';
import { MappingService } from '~/app/services/mapping.service';
import { TaskService } from '~/app/services/task.service';
import { ValidationService } from '~/app/services/validation.service';
import { ValidationError } from '~/app/utils/errors/validation-error';
import { ButtonType, GenericDialog } from '~/app/utils/generic-dialog/generic-dialog.component';
import { getOperationTemplates, getRequestSchema, getResponseSchema, IOperationTemplate } from '~/app/utils/swagger-parser';
import { AdapterService, AdapterType } from '~/app/services/adapter.service';

@Component({
  selector: 'app-transformation',
  templateUrl: './transformation.component.html',
  styleUrls: ['./transformation.component.scss']
})
export class TransformationComponent implements OnInit, OnDestroy {

  public apis: Array<IApi>;

  public targets = new FormArray([]);

  public inputForm = new FormGroup({
    'mS': new FormControl(undefined, Validators.required),
    'mSO': new FormControl(undefined, Validators.required),
    'mSR': new FormControl(undefined, Validators.required),
    'targets': this.targets,
  });

  public mappingSource: IInterface;
  public mappingTargets: { [key: string]: IInterface };

  public sourceOperations: Array<IOperationTemplate>;
  public targetOperations: Array<Array<IOperationTemplate>>;

  public sourceRequestBody: any;
  public sourceResponseBody: any;
  public targetRequestBodies: any;
  public targetResponseBodies: any;

  public requestMappingPairs: Array<IMappingPair>;
  public responseMappingPairs: Array<IMappingPair>;

  public mappingError: ValidationError;

  private subscriptions = new Array<Subscription>();

  @ViewChild(MatExpansionPanel) testRequest: MatExpansionPanel;

  constructor(
    private apiService: ApiService,
    private mappingService: MappingService,
    private adapterService: AdapterService,
    private validationService: ValidationService,
    private dialog: MatDialog,
    private taskService: TaskService,
    private router: Router
  ) { }

  public async ngOnInit() {
    this.requestMappingPairs = new Array<IMappingPair>();
    this.responseMappingPairs = new Array<IMappingPair>();

    this.mappingSource = undefined;
    this.mappingTargets = undefined;

    this.sourceOperations = [];
    this.targetOperations = [];

    this.sourceRequestBody = undefined;
    this.sourceResponseBody = undefined;
    this.targetRequestBodies = undefined;
    this.targetResponseBodies = undefined;

    this.apis = await this.apiService.getApis();

    this.subscriptions.push(this.inputForm.valueChanges.subscribe(() => this.initializeMapping()));

    const sourceChanges = merge(this.inputForm.get('mS').valueChanges, this.inputForm.get('mSO').valueChanges, this.inputForm.get('mSR').valueChanges).pipe(debounceTime(0));
    this.subscriptions.push(sourceChanges.subscribe(async () => {
      const source = this.parseSource();
      this.mappingSource = source;

      if (source) {
        this.sourceRequestBody = {
          [`${source.api.id}_${source.operationId}_${source.responseId}`]: await getRequestSchema(source.api, { operationId: source.operationId, responseId: source.responseId })
        };
        this.sourceResponseBody = {
          [`${source.api.id}_${source.operationId}_${source.responseId}`]: await getResponseSchema(source.api, { operationId: source.operationId, responseId: source.responseId })
        };
      }
    }));
    this.subscriptions.push(this.inputForm.get('mS').valueChanges.subscribe(async (val: IApi) => this.sourceOperations = val && await getOperationTemplates(val)));

    this.subscriptions.push(this.targets.valueChanges.subscribe(async () => {
      const targets = this.parseTargets();
      this.mappingTargets = targets;

      const request = {};
      const response = {};

      for (const [key, value] of Object.entries(targets || {})) {
        request[key] = await getRequestSchema(value.api, { operationId: value.operationId, responseId: value.responseId })
        response[key] = await getResponseSchema(value.api, { operationId: value.operationId, responseId: value.responseId })
      }

      this.targetRequestBodies = request;
      this.targetResponseBodies = response;
    }))

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
      'mTR': new FormControl(undefined, Validators.required),
      'operations': new FormControl([])
    })
    this.subscriptions.push(
      group.get('mT').valueChanges.subscribe(async (val: IApi) => group.get('operations').setValue(val && await getOperationTemplates(val)))
    )
    this.targets.push(group);
  }

  public removeTarget(index: number) {
    this.targets.removeAt(index);
  }

  private parseSource(): IInterface {
    if (!(this.inputForm.get('mS').valid && this.inputForm.get('mSO').valid && this.inputForm.get('mSR').valid)) return undefined;

    const data = this.inputForm.value;
    return {
      api: data.mS,
      operationId: data.mSO.operationId,
      responseId: data.mSR
    }
  }

  private parseTargets(): { [key: string]: IInterface } {
    if (!(this.targets.valid)) return undefined;

    const targets = this.targets.value as Array<{ mT: IApi, mTO: IOperationTemplate, mTR: string }>;
    return targets.reduce((obj, target) => ({
      ...obj,
      [`${target.mT.id}_${target.mTO.operationId}_${target.mTR}`]: {
        api: target.mT,
        operationId: target.mTO.operationId,
        responseId: target.mTR
      } as IInterface
    }), {})
  }

  private async initializeMapping() {
    if (!this.inputForm.valid) return;

    const { request, response } = await this.mappingService.buildMappingPairs(this.parseSource(), this.parseTargets());

    this.requestMappingPairs.splice(0);
    this.requestMappingPairs.push(...request);

    this.responseMappingPairs.splice(0);
    this.responseMappingPairs.push(...response);
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
    this.testRequest.close();
    this.inputForm.reset();
    this.ngOnInit();
  }

  public async buildAdapter() {
    try {
      if ([...this.requestMappingPairs, ...this.responseMappingPairs].some(mp => !mp.mappingCode)) {
        throw new ValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const source = this.parseSource();
      const targets = this.parseTargets();
      const mapping = this.mappingService.buildMapping(source, targets, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

      await this.validationService.validateMapping(source, targets, mapping);

      this.mappingError = undefined;
      const downloadLink = await this.adapterService.createAdapter(mapping, AdapterType.JAVASCRIPT);

      window.open(downloadLink, "_blank");
    } catch (err) {
      if (err instanceof ValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

  public async finishMapping() {
    try {
      if ([...this.requestMappingPairs, ...this.responseMappingPairs].some(mp => !mp.mappingCode)) {
        throw new ValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const source = this.parseSource();
      const targets = this.parseTargets();
      const mapping = this.mappingService.buildMapping(source, targets, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

      await this.validationService.validateMapping(source, targets, mapping);

      this.mappingError = undefined;
      await this.mappingService.createMapping(mapping);

      if (this.taskService.TaskRunning) {
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
