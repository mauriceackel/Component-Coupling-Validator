import { Injectable } from "@angular/core";
import * as JsonLd from 'jsonld';
import * as deepcopy from 'deepcopy';
import { IMappingPair } from '../models/mapping.model';
import { KeyChain } from './jsontree.service';
import { IInterface } from '../models/interface.model';
import { MappingDirection } from './mapping.service';
import { arrayEquals, arrayContainsArray } from '../utils/array-utils';

@Injectable({
  providedIn: "root"
})
export class JsonldService {

  constructor() { }

  public validate(jsonLd: any) {

  }

  public async jsonLdToMappingPairs(source: { body: any, jsonLdContext: any }, target: { body: any, jsonLdContext: any }, direction: MappingDirection): Promise<Array<IMappingPair>> {
    const preparedSourceBody = this.prepareJsonLd(deepcopy(source.body));
    const preparedTargetBody = this.prepareJsonLd(deepcopy(target.body));

    const expandedSource = await JsonLd.expand({
      "@context": source.jsonLdContext || {},
      ...preparedSourceBody
    });
    const expandedTarget = await JsonLd.expand({
      "@context": target.jsonLdContext || {},
      ...preparedTargetBody
    });

    switch (direction) {
      case MappingDirection.INPUT: {
        //If we are mapping an input, we need to map values from the source to the target, hence we use target as required
        const result = this.mapJsonLd(expandedSource, expandedTarget);
        return result.map(e => ({ source: e.provided, target: e.required }))
      } break;
      case MappingDirection.OUTPUT: {
        //If we are mapping an output, we need to map values from the target to the source, hence we use source as required
        const result = this.mapJsonLd(expandedTarget, expandedSource);
        return result.map(e => ({ source: e.required, target: e.provided }))
      } break;
      default: throw new Error("Unknown mapping direction");
    }
  }

  private prepareJsonLd(jsonLd: any, keyChain: KeyChain = []) {
    for (const key in jsonLd) {
      if (key.startsWith("@")) continue;

      if (typeof jsonLd[key] === "object" && !(jsonLd[key] instanceof Array)) {
        this.prepareJsonLd(jsonLd[key], [...keyChain, key]);
      } else {
        jsonLd[key] = [...keyChain, key].join('.');
      }
    }
    return jsonLd;
  }

  private mapJsonLd(provided: Array<any>, required: Array<any>, keyChain: KeyChain = []): Array<{ provided: KeyChain, required: KeyChain }> {
    const result = new Array<{ provided: KeyChain, required: KeyChain }>();

    for (const obj of required) {
      for (const key in obj) {
        if (key === "@value") {
          //This is a lowest level element, now search in provided based on key chain
          const requiredKeyChain: string = obj[key];

          const flattenedProvided = this.flattenExpanded(provided);
          let match = flattenedProvided.find(elem => arrayEquals(elem.key, keyChain));
          if(!match) {
            match = flattenedProvided.find(elem => arrayContainsArray(keyChain, elem.key) || arrayContainsArray(elem.key, keyChain));
          }

          if(match) {
            result.push({ required: requiredKeyChain.split('.'), provided: match.value.split('.') })
          } else {
            console.log("Did not find match for", keyChain.join('.'), "in provided");
          }
        } else if (key === "@list") {
          //TODO: Ignored for now
          console.log("List elem", obj[key])
        } else {
          //This is an expanded URL which has children, continue
          result.push(...this.mapJsonLd(provided, obj[key], [...keyChain, key]));
        }
      }
    }

    return result;
  }

  private flattenExpanded(expandedJsonLd: Array<any>, keyChain: KeyChain = []) {
    let result = new Array<{key: KeyChain, value: string}>();
    for (const elem of expandedJsonLd) {
      for(const key in elem) {
        if(elem[key] instanceof Array) {
          result.push(...this.flattenExpanded(elem[key], [...keyChain, key]));
        } else if(key === "@value") {
          result.push({ key: keyChain, value: elem[key] });
        }
      }
    }
    return result;
  }

  public async buildMappingPairs(source: IInterface, target: IInterface): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const requestMappingPairs = await this.jsonLdToMappingPairs(source.request, target.request, MappingDirection.INPUT);
    const responseMappingPairs = await this.jsonLdToMappingPairs(source.response, target.response, MappingDirection.OUTPUT);

    return {
      request: requestMappingPairs,
      response: responseMappingPairs
    }
  }

}
