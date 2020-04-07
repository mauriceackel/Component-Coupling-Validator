import { Injectable } from "@angular/core";
import * as JsonLd from 'jsonld';
import { IMappingPair } from '../models/mapping.model';
import { KeyChain } from './jsontree.service';
import { IInterface } from '../models/interface.model';
import { MappingDirection } from './mapping.service';

@Injectable({
  providedIn: "root"
})
export class JsonldService {

  constructor() { }

  public validate(jsonLd: any) {

  }

  public jsonLdToMappingPairs(source: any, target: any, direction: MappingDirection): Array<IMappingPair> {
    const preparedSource = this.prepareJsonLd(Object.assign({}, source));
    const preparedTarget = this.prepareJsonLd(Object.assign({}, target));

    const expandedSource = JsonLd.expand(preparedSource)[0];
    const expandedTarget = JsonLd.expand(preparedTarget)[0];

    switch (direction) {
      case MappingDirection.INPUT: {
        //If we are mapping an input, we need to map values from the source to the target, hence we use target as required
        const result = this.mapJsonLd(expandedSource, expandedTarget);
        return result.map(e => ({source: e.provided, target: e.required}))
      } break;
      case MappingDirection.OUTPUT: {
        //If we are mapping an output, we need to map values from the target to the source, hence we use source as required
        const result = this.mapJsonLd(expandedTarget, expandedSource);
        return result.map(e => ({source: e.required, target: e.provided}))
      } break;
      default: throw new Error("Unknown mapping direction");
    }
  }

  private prepareJsonLd(jsonLd: any, keyChain: KeyChain = []) {
    for (const key in jsonLd) {
      if (typeof jsonLd[key] === "object" && !(jsonLd[key] instanceof Array)) {
        this.prepareJsonLd(jsonLd[key], [...keyChain, key]);
      } else {
        jsonLd[key] = [...keyChain, key];
      }
    }
    return jsonLd;
  }

  private mapJsonLd(provided: Array<any>, required: Array<any>): Array<{provided: KeyChain, required: KeyChain}> {
    const result = Array<{provided: KeyChain, required: KeyChain}>();

    for(const obj of required) {
      for(const key in obj) {
        if(key === "@value") {
          //This is a lowest level element, now step back and use the key to search in the provided
          //TODO: How to handle nesting? Idea: If element not found, remove it and try to find a match when only looking at children
          console.log("Value elem", obj[key])
        } else if (key === "@list") {
          //TODO: Maybe special treatment for list?
          console.log("List elem", obj[key])
        } else {
          //This is an expanded URL, continue and wait for backtrack
          //TODO: if we are the parent of an object we don't need to search but if our child directly has a value, we need to start the search here
          console.log("Other elem", obj[key])
        }
      }
    }

    return result;
  }

  public async buildMappingPairs(source: IInterface, target: IInterface): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    return {
      request: (source.request.jsonLd && target.request.jsonLd) ? this.jsonLdToMappingPairs(source.request.jsonLd, target.request.jsonLd, MappingDirection.INPUT) : [],
      response: (source.response.jsonLd && target.response.jsonLd) ? this.jsonLdToMappingPairs(source.response.jsonLd, target.response.jsonLd, MappingDirection.OUTPUT) : []
    }
  }

}
