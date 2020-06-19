import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { IInterface } from '~/app/models/interface.model';
import { IMappingPair, MappingType } from '~/app/models/mapping.model';
import { MappingService } from '~/app/services/mapping.service';
import { RequestService } from '~/app/services/request.service';
import { ValidationService } from '~/app/services/validation.service';
import { ValidationError } from '~/app/utils/errors/validation-error';
import { getRequestUrl } from '~/app/utils/swagger-parser';

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
  public server: string;
  public method: string;

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

  public async ngOnChanges(changes: SimpleChanges) {
    if (changes.inputData) {
      this.currentInputData = this.inputData;
    }
    if (changes.mappingTarget) {
      if(this.mappingTarget) {
        const {method, url} = await getRequestUrl(this.mappingTarget);
        this.server = url;
        this.method = method;
      }
    }
    this.ngOnInit();
  }

  public async testRequest() {
    const mapping = this.mappingService.buildMapping(this.mappingSource, this.mappingTarget, this.requestMappingPairs, this.responseMappingPairs, MappingType.AUTO);
    try {
      await this.validationService.validateMapping(this.mappingSource, this.mappingTarget, mapping);
      this.mappingError = undefined;

      this.outputData = await this.requestService.sendRequest(this.currentInputData, mapping, this.mappingTarget);
    } catch (err) {
      if (err instanceof ValidationError) {
        this.outputData = {};
        this.mappingError = err;
        return;
      }
      throw err;
    }
  }

}
