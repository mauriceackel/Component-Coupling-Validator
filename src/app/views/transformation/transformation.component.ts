import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ActivatedRoute, Router } from '@angular/router';
import { merge, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
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

@Component({
  selector: 'app-transformation',
  templateUrl: './transformation.component.html',
  styleUrls: ['./transformation.component.scss']
})
export class TransformationComponent implements OnInit, OnDestroy {

  public apis: Array<IApi>;

  public inputForm = new FormGroup({
    'mS': new FormControl(undefined, Validators.required),
    'mSO': new FormControl(undefined, Validators.required),
    'mSR': new FormControl(undefined, Validators.required),
    'mT': new FormControl(undefined, Validators.required),
    'mTO': new FormControl(undefined, Validators.required),
    'mTR': new FormControl(undefined, Validators.required),
  });

  public mappingSource: IInterface;
  public mappingTarget: IInterface;

  public sourceOperations: Array<IOperationTemplate>;
  public targetOperations: Array<IOperationTemplate>;

  public sourceRequestBody: any;
  public sourceResponseBody: any;
  public targetRequestBody: any;
  public targetResponseBody: any;

  public requestMappingPairs: Array<IMappingPair>;
  public responseMappingPairs: Array<IMappingPair>;

  public mappingError: ValidationError;

  private subscriptions = new Array<Subscription>();

  @ViewChild(MatExpansionPanel) testRequest: MatExpansionPanel;

  constructor(
    private apiService: ApiService,
    private mappingService: MappingService,
    private validationService: ValidationService,
    private dialog: MatDialog,
    private activatedRoute: ActivatedRoute,
    private taskService: TaskService,
    private router: Router
  ) { }

  public async ngOnInit() {
    this.requestMappingPairs = new Array<IMappingPair>();
    this.responseMappingPairs = new Array<IMappingPair>();

    this.mappingSource = undefined;
    this.mappingTarget = undefined;

    this.sourceOperations = [];
    this.targetOperations = [];

    this.sourceRequestBody = undefined;
    this.sourceResponseBody = undefined;
    this.targetRequestBody = undefined;
    this.targetResponseBody = undefined;

    this.apis = await this.apiService.getApis();

    this.subscriptions.push(this.inputForm.valueChanges.subscribe(() => this.initializeMapping()));

    const sourceChanges = merge(this.inputForm.get('mS').valueChanges, this.inputForm.get('mSO').valueChanges, this.inputForm.get('mSR').valueChanges).pipe(debounceTime(0));
    this.subscriptions.push(sourceChanges.subscribe(async () => {
      const source = this.parseSource();
      this.mappingSource = source;
      if (source) {
        this.sourceRequestBody = await getRequestSchema(source.api, { operationId: source.operationId, responseId: source.responseId });
        this.sourceResponseBody = await getResponseSchema(source.api, { operationId: source.operationId, responseId: source.responseId });
      }
    }));
    this.subscriptions.push(this.inputForm.get('mS').valueChanges.subscribe(async (val: IApi) => this.sourceOperations = val && await getOperationTemplates(val)));

    const targetChanges = merge(this.inputForm.get('mT').valueChanges, this.inputForm.get('mTO').valueChanges, this.inputForm.get('mTR').valueChanges).pipe(debounceTime(0));
    this.subscriptions.push(targetChanges.subscribe(async () => {
      const target = this.parseTarget();
      this.mappingTarget = target;
      if (target) {
        this.targetRequestBody = await getRequestSchema(target.api, { operationId: target.operationId, responseId: target.responseId });
        this.targetResponseBody = await getResponseSchema(target.api, { operationId: target.operationId, responseId: target.responseId });
      }
    }))
    this.subscriptions.push(this.inputForm.get('mT').valueChanges.subscribe(async (val: IApi) => this.targetOperations = val && await getOperationTemplates(val)));

    this.subscriptions.push(this.activatedRoute.queryParams.subscribe(params => {
      this.inputForm.get('mS').setValue(this.apis.find(i => i.id === params["sourceId"]));
      this.inputForm.get('mT').setValue(this.apis.find(i => i.id === params["targetId"]));
    }));
  }

  public ngOnDestroy() {
    this.taskService.pauseTask();
    this.subscriptions.forEach(s => s.unsubscribe());
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

  private parseTarget(): IInterface {
    if (!(this.inputForm.get('mT').valid && this.inputForm.get('mTO').valid && this.inputForm.get('mTR').valid)) return undefined;

    const data = this.inputForm.value;
    return {
      api: data.mT,
      operationId: data.mTO.operationId,
      responseId: data.mTR
    }
  }

  private async initializeMapping() {
    if (!this.inputForm.valid) return;

    const { request, response } = await this.mappingService.buildMappingPairs(this.parseSource(), this.parseTarget());

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

  public async finishMapping() {
    try {
      if ([...this.requestMappingPairs, ...this.responseMappingPairs].some(mp => !mp.mappingCode)) {
        throw new ValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const source = this.parseSource();
      const target = this.parseTarget();
      const mapping = this.mappingService.buildMapping(source, target, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

      await this.validationService.validateMapping(source, target, mapping);

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
