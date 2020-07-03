import { Injectable } from "@angular/core";
import { IInterface } from '../models/interface.model';
import { IMapping } from '../models/mapping.model';
import { ValidationError } from '../utils/errors/validation-error';
import { getRequestSchema, getResponseSchema } from '../utils/swagger-parser';
import { KeyChain } from './jsontree.service';

@Injectable({
  providedIn: "root"
})
export class ValidationService {

  public async validateMapping(source: IInterface, target: IInterface, mapping: IMapping) {
    const { api: srcApi, ...srcOperation } = source;
    const { api: trgApi, ...trgOperation } = target;
    const missingRequest = this.findMissing(JSON.parse(mapping.requestMapping), await getRequestSchema(trgApi, trgOperation, true));
    const missingResponse = this.findMissing(JSON.parse(mapping.responseMapping), await getResponseSchema(srcApi, srcOperation));

    if (missingRequest.length > 0 || missingResponse.length > 0) {
      let errorMessage = ""
      if (missingRequest.length > 0 && missingResponse.length < 1) {
        errorMessage = "Missing request mappings " + missingRequest
      }
      if (missingRequest.length < 1 && missingResponse.length > 0) {
        errorMessage = " Missing response mappings " + missingResponse
      }
      if (missingRequest.length > 0 && missingResponse.length > 0) {
        errorMessage = "Missing request mappings " + missingRequest + ". Missing response mappings " + missingResponse
      }
      throw new ValidationError(errorMessage, missingRequest, missingResponse);
    }
  }

  //Returns properties that are in required but not in provided
  private findMissing(provided: any, required: any, keyChain: KeyChain = []): Array<KeyChain> {
    let result = new Array<KeyChain>();

    for (const key in required) {
      if (typeof required[key] === "object" && !(required[key] instanceof Array)) {
        result.push(...this.findMissing(provided[key], required[key], [...keyChain, key]));
      } else {
        if (provided === undefined || provided[key] === undefined) {
          result.push([...keyChain, key]);
        }
      }
    }

    return result;
  }

}
