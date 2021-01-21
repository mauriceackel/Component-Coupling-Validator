import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionPanel } from '@angular/material/expansion';
import { Router } from '@angular/router';
import { merge, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { IAsyncApi } from '~/app/models/asyncapi.model';
import { IAsyncApiInterface } from '~/app/models/asyncapi-interface.model';
import { IMappingPair, MappingType, MappingDirection, MappingPairType } from '~/app/models/mapping.model';
import { ApiService } from '~/app/services/api.service';
import { MappingService } from '~/app/services/mapping.service';
import { TaskService } from '~/app/services/task.service';
import { ValidationService } from '~/app/services/validation.service';
import { OpenApiValidationError, AsyncApiValidationError } from '~/app/utils/errors/validation-error';
import { ButtonType, GenericDialog } from '~/app/utils/generic-dialog/generic-dialog.component';
import { getOperationTemplates, getMessageSchema, IAsyncApiOperationTemplate } from '~/app/utils/asyncapi-parser';
import { AdapterService, AdapterType } from '~/app/services/adapter.service';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ProgressIndicatorComponent } from '~/app/components/progress-indicator/progress-indicator.component';
import { AttributeMappingService } from '~/app/services/attribute-mapping.service';
import { flatten } from 'flat';
import { arrayEquals } from '~/app/utils/array-utils';

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
    'mSServ': new FormControl(undefined, Validators.required),
    'mSO': new FormControl(undefined, Validators.required),
    'targets': this.targets,
  });

  public mappingSource: IAsyncApiInterface;
  public mappingTargets: { [key: string]: IAsyncApiInterface };

  public sourceOperations: Array<IAsyncApiOperationTemplate>;
  public sourceServers: Array<string>;

  public sourceMessageBody: any;
  public targetMessageBodies: any;

  public mappingPairs: Array<IMappingPair>;

  public automaticMappingPairs: Array<IMappingPair>;

  public mappingError: AsyncApiValidationError;

  public strict: boolean = true;

  private subscriptions: Array<Subscription>;

  private spinnerRef: OverlayRef = this.cdkSpinnerCreate();

  constructor(
    private apiService: ApiService,
    private mappingService: MappingService,
    private attributeMappingService: AttributeMappingService,
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
    this.sourceServers = [];

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

      if (!source) {
        return;
      }

      this.sourceMessageBody = {
        [`${source.api.id}_${source.operationId}`]: await getMessageSchema(source.api, { operationId: source.operationId })
      };

      //Get operation suggestions for target(s)
      this.getOperationSuggestions();
    }));
    this.subscriptions.push(this.inputForm.get('mS').valueChanges.subscribe(async (val: IAsyncApi) => {
      const { servers, operationTemplates } = val && await getOperationTemplates(val, this.inputForm.get('publish').value);
      this.sourceOperations = operationTemplates;
      this.sourceServers = servers;
    }));

    this.subscriptions.push(this.targets.valueChanges.subscribe(async () => {
      const targets = this.parseTargets();
      this.mappingTargets = targets;

      //Get operation suggestions for target(s)
      this.getOperationSuggestions();

      const message = {};

      for (const [key, { api, operationId }] of Object.entries(targets || {})) {
        message[key] = await getMessageSchema(api, { operationId });
      }

      this.targetMessageBodies = message;
    }))

    this.subscriptions.push(this.inputForm.get('publish').valueChanges.subscribe(async (publish: boolean) => {
      const val = this.inputForm.get('mS').value;
      const { servers, operationTemplates } = val && await getOperationTemplates(val, publish);

      this.sourceOperations = operationTemplates;
      this.sourceServers = servers;
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
      'mTServ': new FormControl(undefined, Validators.required),
      'operations': new FormControl([]),
      'servers': new FormControl([]),
    })
    this.subscriptions.push(
      group.get('mT').valueChanges.subscribe(async (val: IAsyncApi) => {
        const { servers, operationTemplates } = val && await getOperationTemplates(val, this.inputForm.get('publish').value);
        group.get('operations').setValue(operationTemplates);
        group.get('servers').setValue(servers);
      })
    )
    this.subscriptions.push(this.inputForm.get('publish').valueChanges.subscribe(async (publish: boolean) => {
      const val = group.get('mT').value;
      const { servers, operationTemplates } = val && await getOperationTemplates(val, publish);
      group.get('operations').setValue(operationTemplates);
      group.get('servers').setValue(servers);
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
      url: data.mSO.url,
      server: data.mSServ
    }
  }

  private parseTargets(): { [key: string]: IAsyncApiInterface } {
    if (!(this.targets.valid)) return undefined;

    const targets = this.targets.value as Array<{ mT: IAsyncApi, mTServ: string, mTO: IAsyncApiOperationTemplate }>;
    return targets.reduce((obj, target) => ({
      ...obj,
      [`${target.mT.id}_${target.mTO.operationId}`]: {
        api: target.mT,
        operationId: target.mTO.operationId,
        url: target.mTO.url,
        server: target.mTServ
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

  changeStrictMode(strict: boolean) {
    this.strict = strict;

    if (!strict) {
      return;
    }

    for (const amP of this.automaticMappingPairs) {
      // If there were manual mappings added for existing automatic ones, replace them
      const idx = this.mappingPairs.findIndex(mP => arrayEquals(amP.required, mP.required))
      if (idx !== -1) {
        this.mappingPairs[idx] = amP;
      }

      // If there were automatic mappings removed, add them again
      if (!this.mappingPairs.includes(amP)) {
        this.mappingPairs.push(amP);
      }
    }
    // Remove potential automatically added mappings (i.e. atrtibute mappings)
    this.mappingPairs = this.mappingPairs.filter(mP => mP.creationType === MappingPairType.MANUAL || this.automaticMappingPairs.includes(mP));

  }

  private async initializeMapping() {
    if (!this.inputForm.valid) return;

    this.showSpinner();

    const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;

    const message = await this.mappingService.buildAsyncApiMappingPairs(this.parseSource(), this.parseTargets(), direction);

    this.mappingPairs.splice(0);
    this.mappingPairs.push(...message);

    this.mappingPairs.push(...await this.getAllAttributeSuggestions());

    this.automaticMappingPairs = new Array(...this.mappingPairs);

    this.stopSpinner();
  }

  private async getOperationSuggestions() {
    if (!this.mappingSource || this.targets.valid) {
      return;
    }

    //Get operation suggestions for target(s)
    const targets = this.targets.value as Array<{ mT: IAsyncApi }>;
    const targetIds = targets.reduce((arr, target) => target?.mT ? ([...arr, target.mT.id]) : arr, [])
    const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;
    const predictions = await this.mappingService.buildAsyncApiOperationPredictions(this.mappingSource, targetIds, direction);

    type Prediction = {
      apiId: string;
      operationId: string;
    }

    const predictionsByTargets = predictions.reduce<{ [key: string]: Prediction[] }>((obj, pred) => ({
      ...obj,
      [pred.apiId]: [...(obj[pred.apiId] || []), pred]
    }), {});

    for (const [apiId, apiPredictions] of Object.entries(predictionsByTargets)) {
      for (const target of this.targets.controls) {
        if (target.get('mT').value?.id !== apiId) {
          continue;
        }

        const operationIds = apiPredictions.map(p => p.operationId);
        const operations: IAsyncApiOperationTemplate[] = target.get('operations').value;

        operations.forEach(op => {
          op.priority = operationIds.includes(op.operationId);
        });
        operations.sort((a, b) => {
          if (a.priority === b.priority) return 0;
          if (a.priority) return -1;
          return 1;
        });
      }
    }

    console.log(predictions)
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
        throw new AsyncApiValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
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
      if (err instanceof AsyncApiValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

  public async getAllAttributeSuggestions() {
    const result: IMappingPair[] = [];
    const publish = this.inputForm.get('publish').value;

    let attributes: any;
    if (publish) {
      const source = this.parseSource();

      const response = {
        [`${source.api.id}_${source.operationId}`]: await getMessageSchema(source.api, { operationId: source.operationId })
      };

      attributes = Object.keys(flatten(response));
    } else {
      const targets = this.parseTargets();
      const request = {};

      for (const [key, value] of Object.entries(targets || {})) {
        request[key] = await getMessageSchema(value.api, { operationId: value.operationId })
      }

      attributes = Object.keys(flatten(request));
    }

    for (const attributeId of attributes) {
      const component = await this.attributeMappingService.getComponentLocal(attributeId, this.mappingPairs);

      let relevant: string[];
      if (publish) {
        const targets = Object.keys(this.parseTargets());
        relevant = component.filter(n => targets.some(t => n.startsWith(t)) && !this.mappingPairs.some(m => m.required.join('.') === n));
      } else {
        const source = this.parseSource();
        const condition = `${source.api}_${source.operationId}`;
        relevant = component.filter(n => n.startsWith(condition) && !this.mappingPairs.some(m => m.required.join('.') === n));
      }

      const suggestedMappingPairs = (await Promise.all(relevant
        .map(async (node) => {
          return [node, await this.attributeMappingService.getMappingLocal(attributeId, node, this.mappingPairs)];
        })))
        .map(([node, transformation]) => {
          const mappingPair: IMappingPair = {
            creationType: MappingPairType.ATTRIBUTE,
            provided: [attributeId.split('.')],
            required: node.split('.'),
            mappingCode: transformation
          }
          return mappingPair;
        });

      result.push(...suggestedMappingPairs);
    }

    return result;
  }

  public async getAttributeSuggestions(mappingPair: IMappingPair) {
    if (!this.attributeMappingService.validateMapping(mappingPair)) {
      return;
    }

    const publish = this.inputForm.get('publish').value;
    const attributeId = mappingPair.provided[0].join('.');
    const component = await this.attributeMappingService.getComponentLocal(attributeId, this.mappingPairs);

    let relevant: string[];
    if (publish) {
      const targets = Object.keys(this.parseTargets());
      relevant = component.filter(n => targets.some(t => n.startsWith(t)) && !this.mappingPairs.some(m => m.required.join('.') === n));
    } else {
      const source = this.parseSource();
      const condition = `${source.api}_${source.operationId}`;
      relevant = component.filter(n => n.startsWith(condition) && !this.mappingPairs.some(m => m.required.join('.') === n));
    }

    const suggestedMappingPairs = (await Promise.all(relevant
      .map(async (node) => {
        return [node, await this.attributeMappingService.getMappingLocal(attributeId, node, this.mappingPairs)];
      })))
      .map(([node, transformation]) => {
        const mappingPair: IMappingPair = {
          creationType: MappingPairType.ATTRIBUTE,
          provided: [attributeId.split('.')],
          required: node.split('.'),
          mappingCode: transformation
        }
        return mappingPair;
      });

    this.mappingPairs.push(...suggestedMappingPairs);
  }

  public async finishMapping() {
    if (!this.strict) {
      return;
    }

    try {
      if (this.mappingPairs.some(mp => !mp.mappingCode)) {
        throw new OpenApiValidationError("Please enter a mapping code for the mappings marked in red (by clicking on it)")
      }

      const direction = this.inputForm.get('publish').value ? MappingDirection.OUTPUT : MappingDirection.INPUT;

      const source = this.parseSource();
      const targets = this.parseTargets();

      //Store attribute mappings here
      const mappingPairs = this.mappingPairs.filter(mp => this.attributeMappingService.validateMapping(mp));
      for (const m of mappingPairs) {
        await this.attributeMappingService.addMapping(m.provided[0].join('.'), m.required.join('.'), m.mappingCode)
      }

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
      if (err instanceof AsyncApiValidationError) {
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
