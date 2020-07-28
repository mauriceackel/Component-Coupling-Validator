import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFirestoreCollection } from '@angular/fire/firestore/public_api';
import { flatten, unflatten } from 'flat';
import { IInterface } from '../models/interface.model';
import { IMapping, IMappingPair, MappingType } from '../models/mapping.model';
import * as getinputs from '../utils/get-inputs/get-inputs';
import { removeUndefined } from '../utils/remove-undefined';
import { AuthenticationService } from './authentication.service';

type Tree = { node: IMapping, children?: Tree[] };
const operators = ['=', '!', '+', '-', '*', '/', '>', '<', ' and ', ' or ', ' in ', '&', '%'];

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
    const sourceId = `${source.api.id}_${source.operationId}_${source.responseId}`;
    const targetIds = Object.keys(targets);

    const mappings = await this.getMappings();
    const mappingTrees = targetIds.map(id => this.treeSearch(sourceId, id, mappings)).reduce((flat, trees) => [...flat, ...trees], []);

    let responseMapping = {};
    let requestMapping = {};
    for (const mappingTree of mappingTrees) {
      const { requestMapping: reqMap, responseMapping: resMap } = this.executeMappingTree(mappingTree);
      responseMapping = { ...responseMapping, ...resMap };
      requestMapping = { ...requestMapping, ...reqMap };
    }

    return {
      request: this.transToMappingPairs(requestMapping, MappingDirection.INPUT),
      response: this.transToMappingPairs(responseMapping, MappingDirection.OUTPUT)
    }
  }

  private treeSearch(sourceId: string, finalTragetId: string, mappings: Array<IMapping>, containedApis: Array<string> = []): Tree[] {
    const sources = mappings.filter(m => m.sourceId === sourceId && !containedApis.includes(sourceId));

    const result = new Array<Tree>();
    for (const source of sources) {
      for (const targetId of source.targetIds) {
        if (targetId === finalTragetId) {
          result.push({ node: source });
        } else {
          const children = this.treeSearch(targetId, finalTragetId, mappings, [...containedApis, sourceId])
          if(children.length > 0) {
            result.push({ node: source, children: children })
          }
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

  private performMapping(input: any, mapping: any) {
    const flatInput = flatten(input);
    const inputKeys = Object.keys(flatInput);
    const m: { [key: string]: string } = flatten(mapping);
    for (const [key, value] of Object.entries(m)) {
      m[key] = inputKeys.reduce((val, k) => val.replace(new RegExp(k, 'g'), operators.some(o => flatInput[k].includes(o)) ? `(${flatInput[k]})` : flatInput[k]), value);
    }
    return unflatten(m);
  }

  private executeMappingTree(mappingTree: Tree, requestInput?: any) {
    const { node, children } = mappingTree;

    let requestMapping = {};

    let newRequestInput = {};
    let responseInput = {};

    if (requestInput === undefined) {
      //First step, pass own request mapping
      newRequestInput = JSON.parse(node.requestMapping);
    } else {
      newRequestInput = this.performMapping(requestInput, JSON.parse(node.requestMapping));
    }

    //Combine all mappings of children, then apply mapping of "node"
    for (const child of children) {
      if (child.children) {
        const result = this.executeMappingTree(child, newRequestInput);
        responseInput = {
          ...responseInput,
          ...result.responseMapping
        }
        requestMapping = {
          ...requestMapping,
          ...result.requestMapping
        }
      } else {
        //Use child mapping as input
        responseInput = {
          ...responseInput,
          ...JSON.parse(child.node.responseMapping)
        }
        requestMapping = {
          ...requestMapping,
          ...this.performMapping(newRequestInput, JSON.parse(child.node.requestMapping))
        }
      }
    }

    const responseMapping = this.performMapping(responseInput, JSON.parse(node.responseMapping));
    return { responseMapping, requestMapping };
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
