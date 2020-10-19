import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ActivatedRoute, Router } from '@angular/router';
import { merge, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { IOpenApi } from '~/app/models/openapi.model';
import { IOpenApiInterface } from '~/app/models/openapi-interface.model';
import { IMappingPair, MappingType } from '~/app/models/mapping.model';
import { ApiService } from '~/app/services/api.service';
import { MappingService } from '~/app/services/mapping.service';
import { TaskService } from '~/app/services/task.service';
import { ValidationService } from '~/app/services/validation.service';
import { OpenApiValidationError } from '~/app/utils/errors/validation-error';
import { ButtonType, GenericDialog } from '~/app/utils/generic-dialog/generic-dialog.component';
import { getOperationTemplates, getRequestSchema, getResponseSchema, IOpenApiOperationTemplate } from '~/app/utils/swagger-parser';
import { AdapterService, AdapterType } from '~/app/services/adapter.service';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ProgressIndicatorComponent } from '~/app/components/progress-indicator/progress-indicator.component';
import { environment } from '~/environments/environment';
import { TaskReportService } from '~/app/services/task-report.service';

const adapterServiceBase = environment.adapterServiceBase;

@Component({
  selector: 'app-openapi-transformation',
  templateUrl: './transformation.component.html',
  styleUrls: ['./transformation.component.scss']
})
export class TransformationComponent implements OnInit, OnDestroy {

  public apis: Array<IOpenApi>;

  public targets = new FormArray([]);

  public inputForm = new FormGroup({
    'mS': new FormControl(undefined, Validators.required),
    'mSO': new FormControl(undefined, Validators.required),
    'mSR': new FormControl(undefined, Validators.required),
    'targets': this.targets,
  });

  public mappingSource: IOpenApiInterface;
  public mappingTargets: { [key: string]: IOpenApiInterface };

  public sourceOperations: Array<IOpenApiOperationTemplate>;
  public targetOperations: Array<Array<IOpenApiOperationTemplate>>;

  public sourceRequestBody: any;
  public sourceResponseBody: any;
  public targetRequestBodies: any;
  public targetResponseBodies: any;

  public requestMappingPairs: Array<IMappingPair>;
  public responseMappingPairs: Array<IMappingPair>;

  public mappingError: OpenApiValidationError;

  private subscriptions: Array<Subscription>;

  @ViewChild(MatExpansionPanel) testRequest: MatExpansionPanel;
  private spinnerRef: OverlayRef = this.cdkSpinnerCreate();

  constructor(
    private apiService: ApiService,
    private mappingService: MappingService,
    private adapterService: AdapterService,
    private validationService: ValidationService,
    private dialog: MatDialog,
    private taskService: TaskService,
    private taskReportService: TaskReportService,
    private router: Router,
    private overlay: Overlay,
    private activatedRoute: ActivatedRoute
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

    this.mappingError = undefined;
    this.subscriptions = new Array<Subscription>();

    this.apis = await this.apiService.getOpenApis();

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
    this.subscriptions.push(this.inputForm.get('mS').valueChanges.subscribe(async (val: IOpenApi) => this.sourceOperations = val && await getOperationTemplates(val)));

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

    this.subscriptions.push(this.activatedRoute.queryParams.subscribe(params => {
      const { source, targets } = params;

      if (source) {
        const [sourceId, sourceOperation, sourceResponse] = source.split('$');

        const api = this.apis.find(i => i.id === sourceId);
        this.inputForm.get('mS').setValue(api);

        if (sourceOperation) {
          getOperationTemplates(api).then(opTemps => {
            this.sourceOperations = opTemps;
            this.inputForm.get('mSO').setValue(opTemps.find(o => o.operationId === sourceOperation));
          });
        }

        if (sourceResponse) {
          this.inputForm.get('mSR').setValue(sourceResponse);
        }
      }

      const targetObjs: string[] | undefined = targets && targets.split(',');
      if (targetObjs && targetObjs.length > 0) {
        this.targets.clear();

        for (const target of targetObjs) {
          const [targetId, targetOperation, targetResponse] = target.split('$');

          const group = new FormGroup({
            'mT': new FormControl(undefined, Validators.required),
            'mTO': new FormControl(undefined, Validators.required),
            'mTR': new FormControl(undefined, Validators.required),
            'operations': new FormControl([])
          })

          const api = this.apis.find(i => i.id === targetId);
          group.get('mT').setValue(api);

          if (targetOperation) {
            getOperationTemplates(api).then(opTemps => {
              group.get('operations').setValue(opTemps);
              group.get('mTO').setValue(opTemps.find(o => o.operationId === targetOperation));
            });
          }

          if (targetResponse) {
            group.get('mTR').setValue(targetResponse);
          }

          this.subscriptions.push(
            group.get('mT').valueChanges.subscribe(async (val: IOpenApi) => group.get('operations').setValue(val && await getOperationTemplates(val)))
          )
          this.targets.push(group);
        }
      }
    }));

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
      group.get('mT').valueChanges.subscribe(async (val: IOpenApi) => group.get('operations').setValue(val && await getOperationTemplates(val)))
    )
    this.targets.push(group);
  }

  public removeTarget(index: number) {
    this.targets.removeAt(index);
  }

  private parseSource(): IOpenApiInterface {
    if (!(this.inputForm.get('mS').valid && this.inputForm.get('mSO').valid && this.inputForm.get('mSR').valid)) return undefined;

    const data = this.inputForm.value;
    return {
      api: data.mS,
      operationId: data.mSO.operationId,
      responseId: data.mSR
    }
  }

  private parseTargets(): { [key: string]: IOpenApiInterface } {
    if (!(this.targets.valid)) return undefined;

    const targets = this.targets.value as Array<{ mT: IOpenApi, mTO: IOpenApiOperationTemplate, mTR: string }>;
    return targets.reduce((obj, target) => ({
      ...obj,
      [`${target.mT.id}_${target.mTO.operationId}_${target.mTR}`]: {
        api: target.mT,
        operationId: target.mTO.operationId,
        responseId: target.mTR
      } as IOpenApiInterface
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

    const { request, response } = await this.mappingService.buildOpenApiMappingPairs(this.parseSource(), this.parseTargets());

    this.requestMappingPairs.splice(0);
    this.requestMappingPairs.push(...request);

    this.responseMappingPairs.splice(0);
    this.responseMappingPairs.push(...response);

    this.stopSpinner();
  }

  mapSame(request: boolean) {
    if (request) {
      const mappingPairs = this.mappingService.buildSameMappingPairs(this.sourceRequestBody, this.targetRequestBodies);
      mappingPairs.forEach(p => {
        if (!this.requestMappingPairs.find(e => e.required.join('.') === p.required.join('.'))) {
          this.requestMappingPairs.push(p);
        }
      })
    } else {
      const mappingPairs = this.mappingService.buildSameMappingPairs(this.targetResponseBodies, this.sourceResponseBody);
      mappingPairs.forEach(p => {
        if (!this.responseMappingPairs.find(e => e.required.join('.') === p.required.join('.'))) {
          this.responseMappingPairs.push(p);
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
    this.testRequest.close();
    this.subscriptions.forEach(s => s.unsubscribe());
    this.inputForm.reset();
    this.ngOnInit();
  }

  public async buildAdapter() {
    this.showSpinner();

    try {
      if ([...this.requestMappingPairs, ...this.responseMappingPairs].some(mp => !mp.mappingCode)) {
        throw new OpenApiValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const source = this.parseSource();
      const targets = this.parseTargets();
      const mapping = this.mappingService.buildOpenApiMapping(source, targets, this.requestMappingPairs, this.responseMappingPairs, MappingType.TRANSFORMATION);

      await this.validationService.validateOpenApiMappingComplete(source, targets, mapping);

      this.mappingError = undefined;

      if(this.taskService.TaskRunning) {
        await this.taskReportService.updateTaskReport({
          id: this.taskService.ActiveTaskReportId,
          mapping: {
            requestMapping: mapping.requestMapping,
            responseMapping: mapping.responseMapping
          }
        });
      }

      const { port, token } = await this.adapterService.createOpenApiAdapter(mapping, AdapterType.JAVASCRIPT, this.taskService.ActiveTaskReportId);
      const url = `http://${adapterServiceBase}:${port}`;
      await this.showTokenDialog(token, url);
      window.open(url, "_blank");
    } catch (err) {
      if (err instanceof OpenApiValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    } finally {
      this.stopSpinner();
    }
  }

  public async finishMapping() {
    try {
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

  private showTokenDialog(token: string, url: string) {
    const dialogRef: MatDialogRef<GenericDialog, void> = this.dialog.open(GenericDialog, {
      position: {
        top: "5%"
      },
      data: {
        title: "Continue Editing",
        content: `You will be taken to another service now to finish the mapping.\n\n\nIf you don't get automatically redirected, open the following url in a NEW TAB!\n\n\n${url}\n\n\nCopy the following token to log in:\n\n\n${token}`,
        buttons: [ButtonType.OK]
      }
    });

    return dialogRef.afterClosed().toPromise();
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
