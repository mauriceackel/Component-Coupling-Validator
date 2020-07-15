import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFirestoreCollection } from '@angular/fire/firestore/public_api';
import { flatten, unflatten } from 'flat';
import { IInterface } from '../models/interface.model';
import { IMapping, IMappingPair, MappingType } from '../models/mapping.model';
import * as getinputs from '../utils/get-inputs/get-inputs';
import { removeUndefined } from '../utils/remove-undefined';
import { AuthenticationService } from './authentication.service';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class MappingService {

  private mappingColl: AngularFirestoreCollection<IMapping>;

  constructor(private identificationService: AuthenticationService, private firestore: AngularFirestore) {
    this.mappingColl = firestore.collection('mappings');
  }

  /**
   * Get all mappings from the database
   * @param conditions A set of conditions that are applied when getting the results
   */
  public async getMappings(conditions: { [key: string]: any } = {}): Promise<Array<IMapping>> {
    const mappings = (await this.mappingColl.get().toPromise()).docs.map(doc => this.parseMapping(doc.id, doc.data()));
    const filteredMappings = mappings.filter(mapping => Object.entries(conditions).every(e => mapping[e[0]] === e[1]));

    return filteredMappings;
  }

  /**
   * Get a single mapping by id
   * @param id The id of the mapping that schould be retrieved
   */
  public async getMapping(id: string): Promise<IMapping> {
    const doc = await this.mappingColl.doc<IMapping>(id).get().toPromise();
    return this.parseMapping(doc.id, doc.data());
  }

  /**
   * Store a mapping in the database
   * @param mapping
   */
  public async createMapping(mapping: IMapping) {
    const id = this.firestore.createId();
    return this.mappingColl.doc(id).set(this.serializeMapping(mapping));
  }

  /**
   * Updates a mapping in the database
   * @param mapping
   */
  public async updateMapping(mapping: IMapping) {
    return this.mappingColl.doc(mapping.id).update(this.serializeMapping(mapping));
  }

  private parseMapping(id: string, mapping: any): IMapping {
    return {
      ...mapping,
      id
    }
  }

  private serializeMapping(mapping: IMapping) {
    let result = {
      ...mapping,
      id: undefined
    }
    result = removeUndefined(result);
    return result;
  }

  /**
   * Creates a mapping based on the input parameters
   * @param source The source interface
   * @param target The target interface
   * @param requestMappingPairs The mapping pairs of the request (source->target)
   * @param responseMappingPairs The mapping pairs of the response (target->source)
   * @param type The type of this mapping
   */
  public buildMapping(source: IInterface, targets: { [key: string]: IInterface }, requestMappingPairs: Array<IMappingPair>, responseMappingPairs: Array<IMappingPair>, type: MappingType): IMapping {
    const requestTransformation = this.mappingPairsToTrans(requestMappingPairs, MappingDirection.INPUT);
    const responseTransformation = this.mappingPairsToTrans(responseMappingPairs, MappingDirection.OUTPUT);

    return {
      id: undefined,
      createdBy: this.identificationService.User.uid,
      type: type,
      sourceId: `${source.api.id}${source.operationId}${source.responseId}`,
      targetIds: Object.keys(targets),
      requestMapping: JSON.stringify(requestTransformation),
      responseMapping: JSON.stringify(responseTransformation)
    }
  }

  /**
   * Creates a JSONata mapping from an arrray of mapping pairs
   * @param mappingPairs A list of mapping pairs that will build the transformation
   */
  private mappingPairsToTrans(mappingPairs: Array<IMappingPair>, direction: MappingDirection) {
    return unflatten(mappingPairs.reduce((obj, p) => {
      obj[p.required.join('.')] = p.mappingCode;
      return obj;
    }, {}));
  }

  /**
   * Create mapping pairs based on a source and target interface, taking transitive chains into account
   * @param source The source interface
   * @param target The target interface
   */
  public async buildMappingPairs(source: IInterface, targets: { [key: string]: IInterface }): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const mappingChains = await this.findMappingChains(`${source.api.id}${source.operationId}${source.responseId}`, Object.keys(targets));

    if (mappingChains.length === 0) return { request: [], response: [] }

    const { requestMapping, responseMapping } = this.executeMappingChains(mappingChains);

    return {
      request: this.transToMappingPairs(requestMapping, MappingDirection.INPUT),
      response: this.transToMappingPairs(responseMapping, MappingDirection.OUTPUT)
    }
  }

  public async findMappingChains(sourceId: string, targetIds: string[]) {
    const mappings = await this.getMappings({ type: MappingType.TRANSFORMATION });

    const tree = { node: "ROOT", children: targetIds.map(id => this.treeSearch(sourceId, id, mappings)) };
    const flatChains = this.flattenTree(tree).map(chain => chain.slice(1));

    return flatChains;
  }

  private flattenTree(tree: { node: any, children?: any[] }, chain: Array<IMapping> = []): Array<Array<IMapping>> {
    const result: Array<Array<IMapping>> = [];

    if (tree.children) {
      for (const child of tree.children) {
        result.push(...this.flattenTree(child, [...chain, tree.node]))
      }
    } else if (tree.node === "SELF") {
      //Only add mapping if it ends on a "SELF"-node, meaning that the target ids matched
      result.push(chain);
    }

    return result;
  }

  private treeSearch(sourceId: string, targetId: string, mappings: Array<IMapping>, containedMappings: Array<IMapping> = []): any {
    const result = [];

    //Prevent circles
    const source = mappings.find(m => m.sourceId === sourceId && !containedMappings.includes(m));
    if (!source) return [];

    for (const id of source.targetIds) {
      if (id === targetId) {
        result.push({ node: "SELF" });
      } else {
        const tmpResult = this.treeSearch(id, targetId, mappings, [...containedMappings, source]);
        if (!Array.isArray(tmpResult)) result.push(tmpResult);
      }
    }

    return { node: source, children: result };
  }

  /**
   * Creates an array of mapping pairs from an jsonata input
   * @param transformation The JSONata transformation as object
   */
  private transToMappingPairs(transformation: any, direction: MappingDirection, keyChain: Array<string> = []): Array<IMappingPair> {
    const result = new Array<IMappingPair>();

    for (const key in transformation) {
      if (typeof transformation[key] === "object" && !(transformation[key] instanceof Array)) {
        result.push(...this.transToMappingPairs(transformation[key], direction, [...keyChain, key]));
      } else {
        const inputs = getinputs(`{"${key}": ${transformation[key]}}`).getInputs({});
        const uniqueInputs = inputs.filter((k, i) => inputs.lastIndexOf(k) === i);
        const pair: IMappingPair = {
          provided: uniqueInputs.map(k => k.split('.')),
          required: [...keyChain, key],
          mappingCode: transformation[key]
        }
        result.push(pair);
      }
    }

    return result;
  }

  private executeMappingChains(mappingChains: Array<Array<IMapping>>): { requestMapping: object, responseMapping: object } {
    const sortedByLength = mappingChains.sort((c1, c2) => c1.length - c2.length);

    let requestMapping = {};
    let responseMapping = {};

    for (const mappingChain of sortedByLength) {
      const { requestMapping: reqMap, responseMapping: resMap } = this.executeMappingChain(mappingChain);
      requestMapping = {
        ...flatten(reqMap),
        ...requestMapping
      }
      responseMapping = {
        ...flatten(resMap),
        ...responseMapping
      }
    }

    return { requestMapping: unflatten(requestMapping), responseMapping: unflatten(responseMapping) };
  }

  /**
   * Executes a chain of mappings, resulting in a new mapping that maps from the source of the first mapping to the target of the last mapping
   * @param mappingChain The transitive chain of mappings
   */
  private executeMappingChain(mappingChain: Array<IMapping>): { requestMapping: object, responseMapping: object } {
    const operators = ['=', '!', '+', '-', '*', '/', '>', '<', ' and ', ' or ', ' in ', '&', '%'];

    const [requestInput, ...requestChain] = new Array(...mappingChain);

    const responseChain = new Array(...mappingChain);
    const responseInput = responseChain.pop();

    const requestMapping = requestChain.reduce((input, mapping) => {
      const flatInput = flatten(input);
      const inputKeys = Object.keys(flatInput);
      const m: { [key: string]: string } = flatten(JSON.parse(mapping.requestMapping));
      for (const [key, value] of Object.entries(m)) {
        m[key] = inputKeys.reduce((val, k) => val.replace(new RegExp(k, 'g'), operators.some(o => flatInput[k].includes(o)) ? `(${flatInput[k]})` : flatInput[k]), value);
      }
      return unflatten(m);
    }, JSON.parse(requestInput.requestMapping));

    const responseMapping = responseChain.reduceRight((input, mapping) => {
      const flatInput = flatten(input);
      const inputKeys = Object.keys(flatInput);
      const m: { [key: string]: string } = flatten(JSON.parse(mapping.responseMapping));
      for (const [key, value] of Object.entries(m)) {
        m[key] = inputKeys.reduce((val, k) => val.replace(new RegExp(k, 'g'), operators.some(o => flatInput[k].includes(o)) ? `(${flatInput[k]})` : flatInput[k]), value);
      }
      return unflatten(m);
    }, JSON.parse(responseInput.responseMapping));

    return {
      requestMapping,
      responseMapping
    }
  }
}

export enum MappingDirection {
  INPUT, OUTPUT
}

/**
   * Method that takes a stringified JSON object as input and removes the quotes of all string properties.
   *
   * Exmaple:
   * { "foo":"bar" } --> { "foo":bar }
   */
export function stringifyedToJsonata(obj: string) {
  const keyValueRegex = /(?:\"|\')([^"]*)(?:\"|\')(?=:)(?:\:\s*)(?:\"|\')?(true|false|(?:[^"]|\\\")*)(?:"(?=\s*(,|})))/g;
  return obj.replace(keyValueRegex, '"$1":$2').replace(/\\\"/g, '"');
}
