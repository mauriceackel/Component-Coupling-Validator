import { Injectable } from "@angular/core";
import { IInterface } from '../models/interface.model';
import { IMapping } from '../models/mapping.model';
import { ValidationError } from '../utils/errors/validation-error';
import { getRequestSchema, getResponseSchema } from '../utils/swagger-parser';
import { flatten, unflatten } from 'flat';
import { KeyChain } from './jsontree.service';

@Injectable({
  providedIn: "root"
})
export class ValidationService {

  public async validateMapping(source: IInterface, targets: { [key: string]: IInterface }, mapping: IMapping) {
    const { api: srcApi, ...srcOperation } = source;

    const targetRequestBodies = {};
    for (const [key, value] of Object.entries(targets || {})) {
      targetRequestBodies[key] = await getRequestSchema(value.api, { operationId: value.operationId, responseId: value.responseId }, true)
    }
    const missingRequest = this.findMissing(JSON.parse(mapping.requestMapping), targetRequestBodies);

    const sourceRequestBody = {
      [`${srcApi.id}_${srcOperation.operationId}_${srcOperation.responseId}`]: await getResponseSchema(srcApi, srcOperation)
    }
    const missingResponse = this.findMissing(JSON.parse(mapping.responseMapping), sourceRequestBody);

    if (missingRequest.length > 0 || missingResponse.length > 0) {
      let errorMessage = ""
      if (missingRequest.length > 0 && missingResponse.length < 1) {
        errorMessage = "Missing request mappings " + missingRequest.map(m => m.join('.')).join(', ')
      }
      if (missingRequest.length < 1 && missingResponse.length > 0) {
        errorMessage = " Missing response mappings " + missingResponse.map(m => m.join('.')).join(', ')
      }
      if (missingRequest.length > 0 && missingResponse.length > 0) {
        errorMessage = "Missing request mappings\n" + missingRequest.map(m => m.join('.')).join(', ') + "\n\nMissing response mappings\n" + missingResponse.map(m => m.join('.')).join(', ')
      }
      throw new ValidationError(errorMessage, missingRequest, missingResponse);
    }
  }

  //Returns properties that are in required but not in provided
  private findMissing(provided: any, required: any, keyChain: KeyChain = []): Array<KeyChain> {
    let result = new Array<KeyChain>();

    const providedKeys = Object.keys(flatten(provided));
    const requiredKeys = Object.keys(flatten(required));

    for(const requiredKey of requiredKeys) {
      if(!providedKeys.includes(requiredKey)) {
        result.push(requiredKey.split('.'));
      }
    }

    return result;
  }

}
