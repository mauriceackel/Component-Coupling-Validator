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
   * Find the shortest mapping chain between some mapping source and target
   * @param sourceId The id of the source interface
   * @param targetId The id of the target interface
   */
  public async findMappingChain(sourceId: string, targetId: string) {
    const mappings = await this.getMappings({ type: MappingType.TRANSFORMATION });

    return this.bfs(sourceId, targetId, mappings);
  }

  /**
   * Performs a breadth first search on all mappings and returns a chain of mappings if there is a path from source to target. Else returns undefined.
   * @param sourceId The id of the source interface
   * @param targetId The id of the target interface
   * @param mappings The mappings in which to search for a path from source to target
   */
  private bfs(sourceId: string, targetId: string, mappings: Array<IMapping>) {
    const queue = new Array<Array<IMapping>>(); //Queue is an array of paths

    //Push a dummy mapping as first element to get things going
    queue.push([{ targetId: sourceId } as any]);

    while (queue.length !== 0) {
      //Get the path from the queue
      const path = queue.pop();

      //Get the last element from tht path. This is our mapping we need to check.
      const mapping = path[path.length - 1]

      if (mapping.targetId === targetId && path.length > 1) {
        //Return the path, while removing dummy element
        return path.slice(1);
      }

      const children = mappings.filter(m => m.sourceId === mapping.targetId);
      for (const child of children) {
        //If path already inclusdes this mapping, we are running into a loop here
        if (!path.includes(child)) {
          queue.push(new Array<IMapping>(...path, child));
        }
      }
    }

    return [];
  }

  /**
   * Creates a mapping based on the input parameters
   * @param source The source interface
   * @param target The target interface
   * @param requestMappingPairs The mapping pairs of the request (source->target)
   * @param responseMappingPairs The mapping pairs of the response (target->source)
   * @param type The type of this mapping
   */
  public buildMapping(source: IInterface, target: IInterface, requestMappingPairs: Array<IMappingPair>, responseMappingPairs: Array<IMappingPair>, type: MappingType): IMapping {
    const requestTransformation = this.mappingPairsToTrans(requestMappingPairs, MappingDirection.INPUT);
    const responseTransformation = this.mappingPairsToTrans(responseMappingPairs, MappingDirection.OUTPUT);

    return {
      id: undefined,
      createdBy: this.identificationService.User.uid,
      type: type,
      sourceId: `${source.api.id}.${source.operationId}.${source.responseId}`,
      targetId: `${target.api.id}.${target.operationId}.${target.responseId}`,
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
  public async buildMappingPairs(source: IInterface, target: IInterface): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const mappingChain = await this.findMappingChain(`${source.api.id}.${source.operationId}.${source.responseId}`, `${target.api.id}.${target.operationId}.${target.responseId}`);

    if (!mappingChain || mappingChain.length === 0) return { request: [], response: [] }

    const resultingMapping = this.executeMappingChain(mappingChain);

    return {
      request: this.transToMappingPairs(JSON.parse(resultingMapping.requestMapping), MappingDirection.INPUT),
      response: this.transToMappingPairs(JSON.parse(resultingMapping.responseMapping), MappingDirection.OUTPUT)
    }
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

  /**
   * Executes a chain of mappings, resulting in a new mapping that maps from the source of the first mapping to the target of the last mapping
   * @param mappingChain The transitive chain of mappings
   */
  private executeMappingChain(mappingChain: Array<IMapping>): IMapping {
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
      id: undefined,
      createdBy: undefined,
      type: MappingType.AUTO,
      sourceId: mappingChain[0].sourceId,
      targetId: mappingChain[mappingChain.length - 1].targetId,
      requestMapping: JSON.stringify(requestMapping),
      responseMapping: JSON.stringify(responseMapping)
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
  const keyValueRegex = /(?:\"|\')([^"]*)(?:\"|\')(?=:)(?:\:\s*)(?:\"|\')?(true|false|[^"]*)(?:"(?=\s*(,|})))/g;
  return obj.replace(keyValueRegex, '"$1":$2');
}
