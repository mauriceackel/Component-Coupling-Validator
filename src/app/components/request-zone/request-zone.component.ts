import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { RequestService } from '~/app/services/request.service';
import { MappingService } from '~/app/services/mapping.service';
import { ValidationService } from '~/app/services/validation.service';
import { ValidationError } from '~/app/utils/errors/validation-error';
import { IInterface } from '~/app/models/interface.model';
import { MappingType, IMappingPair } from '~/app/models/mapping.model';

@Component({
  selector: 'app-request-zone',
  templateUrl: './request-zone.component.html',
})
export class RequestZoneComponent implements OnInit, OnChanges {

  @Input("leftHeading") public leftHeading: string;
  @Input("rightHeading") public rightHeading: string;

  @Input("inputData") public inputData: any;
  public currentInputData: any;
  public outputData: any;

  @Input("mappingSource") public mappingSource: IInterface;
  @Input("mappingTarget") public mappingTarget: IInterface;

  @Input("requestMappingPairs") public requestMappingPairs: Array<IMappingPair>;
  @Input("responseMappingPairs") public responseMappingPairs: Array<IMappingPair>;

  public mappingError: ValidationError;

  constructor(
    private requestService: RequestService,
    private mappingService: MappingService,
    private validationService: ValidationService
  ) { }

  public ngOnInit() {
  }

  public ngOnChanges(changes: SimpleChanges) {
    if (changes.inputData) {
      this.currentInputData = this.inputData;
    }
    this.ngOnInit();
  }

  public async testRequest() {
    const mapping = this.mappingService.buildMapping(this.mappingSource, this.mappingTarget, this.requestMappingPairs, this.responseMappingPairs, MappingType.AUTO);
    try {
      this.validationService.validateMapping(this.mappingSource, this.mappingTarget, mapping);
      this.mappingError = undefined;

      this.outputData = await this.requestService.sendRequest(this.currentInputData, mapping, this.mappingTarget);
    } catch (err) {
      if (err instanceof ValidationError) {
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

}
