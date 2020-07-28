import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFirestoreCollection } from '@angular/fire/firestore/public_api';
import { flatten, unflatten } from 'flat';
import { IInterface } from '../models/interface.model';
import { IMapping, IMappingPair, MappingType } from '../models/mapping.model';
import * as getinputs from '../utils/get-inputs/get-inputs';
import { removeUndefined } from '../utils/remove-undefined';
import { AuthenticationService } from './authentication.service';

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
    const reverseMappings = this.buildReverseMappings(mapping);

    console.log(reverseMappings);

    return Promise.all([mapping, ...reverseMappings].map(m => {
      const id = this.firestore.createId();
      this.mappingColl.doc(id).set(this.serializeMapping(m));
    }));
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
      sourceId: `${source.api.id}_${source.operationId}_${source.responseId}`,
      targetIds: Object.keys(targets),
      requestMapping: JSON.stringify(requestTransformation),
      responseMapping: JSON.stringify(responseTransformation)
    }
  }

  public buildReverseMappings(mapping: IMapping): Array<IMapping> {
    return mapping.targetIds.map(targetId => ({
      id: undefined,
      sourceId: targetId,
      targetIds: [mapping.sourceId],
      createdBy: mapping.createdBy,
      type: MappingType.REVERSE,
      requestMapping: this.reverseTransformation([targetId, mapping.sourceId], mapping.requestMapping),
      responseMapping: this.reverseTransformation([targetId, mapping.sourceId], mapping.responseMapping)
    }));
  }

  private reverseTransformation(prefixes: string[], transformation: string): string {
    const transformationObject: { [key: string]: string } = flatten(JSON.parse(transformation));

    const reversedMapping = Object.entries(transformationObject).reduce((reversed, [key, value]) => {
      const relevant = prefixes.some(p => key.startsWith(p)) && prefixes.some(p => value.startsWith(p));
      const simple = value.match(/^(\w|\.)*$/g) && !(value === "true" || value === "false" || !Number.isNaN(Number.parseFloat(value)));
      if (simple && relevant) {
        return {
          ...reversed,
          [value]: key,
        }
      }
      return reversed;
    }, {});

    return JSON.stringify(unflatten(reversedMapping));
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

  public buildSameMappingPairs(provided: any, required: any): Array<IMappingPair> {
    const mappingPairs = new Map<string, IMappingPair>();

    const flatProvided = flatten(provided);
    const flatRequired = flatten(required);

    for (const providedKey of Object.keys(flatProvided)) {
      for (const requiredKey of Object.keys(flatRequired)) {
        const unprefixedProvidedKey = providedKey.substr(providedKey.indexOf('.') + 1);
        const unprefixedRequiredKey = requiredKey.substr(requiredKey.indexOf('.') + 1);

        if (unprefixedProvidedKey === unprefixedRequiredKey) {
          let mappingPair: IMappingPair;
          if (mappingPairs.has(requiredKey)) {
            const existingPair = mappingPairs.get(requiredKey);
            mappingPair = {
              mappingCode: "",
              provided: [...existingPair.provided, providedKey.split('.')],
              required: existingPair.required
            }
          } else {
            mappingPair = {
              mappingCode: providedKey,
              provided: [providedKey.split('.')],
              required: requiredKey.split('.')
            }
          }
          mappingPairs.set(requiredKey, mappingPair);
        }
      }
    }

    return [...mappingPairs.values()];
  }

  /**
   * Create mapping pairs based on a source and target interface, taking transitive chains into account
   * @param source The source interface
   * @param target The target interface
   */
  public async buildMappingPairs(source: IInterface, targets: { [key: string]: IInterface }): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const mappingChains = await this.findMappingChains(`${source.api.id}_${source.operationId}_${source.responseId}`, Object.keys(targets));

    if (mappingChains.length === 0) return { request: [], response: [] }

    const { requestMapping, responseMapping } = this.executeMappingChains(mappingChains);

    return {
      request: this.transToMappingPairs(requestMapping, MappingDirection.INPUT),
      response: this.transToMappingPairs(responseMapping, MappingDirection.OUTPUT)
    }
  }

  public async findMappingChains(sourceId: string, targetIds: string[]) {
    const mappings = await this.getMappings();

    const tree = { node: "ROOT", children: targetIds.map(id => this.treeSearch(sourceId, id, mappings)).reduce((agg, arr) => [...agg, ...arr], []) };
    const flatChains = this.flattenTree(tree).map(chain => chain.slice(1));

    return flatChains;
  }

  private flattenTree(tree: { node: any, children?: any[] }, chain: Array<IMapping> = []): Array<Array<IMapping>> {
    const result: Array<Array<IMapping>> = [];

    if (tree.children) {
      for (const child of tree.children) {
        result.push(...this.flattenTree(child, [...chain, tree.node]))
      }
    } else {
      //Only add mapping if it has no children, meaning that the target ids matched
      result.push([...chain, tree.node]);
    }

    return result;
  }

  private treeSearch(sourceId: string, finalTragetId: string, mappings: Array<IMapping>, containedMappings: Array<IMapping> = []): any {
    const sources = mappings.filter(m => m.sourceId === sourceId && !containedMappings.includes(m));

    const result = [];
    for(const source of sources) {
      for(const targetId of source.targetIds) {
        if(targetId === finalTragetId) {
          result.push({ node: source });
        } else {
          const children = this.treeSearch(targetId, finalTragetId, mappings, [...containedMappings, source])
          result.push({node: source, children: children})
        }
      }
    }

    return result;
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
