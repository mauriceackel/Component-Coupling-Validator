import { Injectable } from "@angular/core";
import { IInterface } from '../models/interface.model';
import { IMapping } from '../models/mapping.model';
import { KeyChain } from './jsontree.service';
import { ValidationError } from '../utils/validation-error';

@Injectable({
  providedIn: "root"
})
export class ValidationService {

  public validateMapping(source: IInterface, target: IInterface, mapping: IMapping) {
    const missingRequest = this.findMissing(JSON.parse(mapping.requestMapping), target.request.body);
    const missingResponse = this.findMissing(JSON.parse(mapping.responseMapping), source.response.body);

    if(missingRequest.length > 0 || missingResponse.length > 0) {
      throw new ValidationError("You have missing properties in your mapping", missingRequest, missingResponse);
    }
  }

  //Returns properties that are in required but not in provided
  private findMissing(provided: any, required: any, keyChain: KeyChain = []): Array<KeyChain> {
    let result = new Array<KeyChain>();

    for(const key in required) {
      if(typeof required[key] === "object" && !(required[key] instanceof Array)) {
        result.push(...this.findMissing(provided[key], required[key], [...keyChain, key]));
      } else {
        if(provided === undefined || provided[key] === undefined) {
          result.push([...keyChain, key]);
        }
      }
    }

    return result;
  }

}
