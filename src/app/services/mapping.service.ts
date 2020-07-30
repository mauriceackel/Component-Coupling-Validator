import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFirestoreCollection } from '@angular/fire/firestore/public_api';
import { flatten, unflatten } from 'flat';
import { IInterface } from '../models/interface.model';
import { IMapping, IMappingPair, MappingType } from '../models/mapping.model';
import * as getinputs from '../utils/get-inputs/get-inputs';
import { removeUndefined } from '../utils/remove-undefined';
import { AuthenticationService } from './authentication.service';
import createSha1Hash from '../utils/buildHash';
import { ValidationService } from './validation.service';

type Tree = { node: ParsedMapping, children?: Tree[] };
type ParsedMapping = Omit<IMapping, "requestMapping" | "responseMapping"> & { requestMapping: { [key: string]: string }, requestMappingInputKeys: { [key: string]: string[] }, responseMapping: { [key: string]: string }, responseMappingInputKeys: { [key: string]: string[] } }
const operators = ['=', '!', '+', '-', '*', '/', '>', '<', ' and ', ' or ', ' in ', '&', '%'];

@Injectable({
  providedIn: 'root'
})
export class MappingService {

  private mappingColl: AngularFirestoreCollection<IMapping>;

  private count: number = 0;

  constructor(
    private identificationService: AuthenticationService,
    private firestore: AngularFirestore,
    private validationService: ValidationService
  ) {
    this.mappingColl = this.firestore.collection('mappings');
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

    return Promise.all([mapping, ...reverseMappings].map(async (m) => {
      const id = await createSha1Hash(m.requestMapping + m.responseMapping);
      return this.mappingColl.doc(id).set(this.serializeMapping(m));
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

  /**
   * Creates a symmetrical, "reverted" mapping for a mapping that is about to be stored in the database.
   *
   * @param mapping The mapping that should be reverted
   */
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

  /**
   * Creates a reversed mapping for a given JSONata mapping
   *
   * @param prefixes The relevant source and or target IDs, used to filter out mappings
   * @param transformation The JSONata mapping that should be reverted
   */
  private reverseTransformation(prefixes: string[], transformation: string): string {
    //Flatten out the parsed JSONata transformation
    const transformationObject: { [key: string]: string } = flatten(JSON.parse(transformation));

    //Loop over each entry in the JSONata mapping
    const reversedMapping = Object.entries(transformationObject).reduce((reversed, [key, value]) => {
      //The mapping is only relevant if both that eky and the value side of the mapping refer to an API inside the prefixes
      const relevant = prefixes.some(p => key.startsWith(p)) && prefixes.some(p => value.startsWith(p));
      //A mapping is only simple, if it containes no logic at all so it simply maps one key to another one
      const simple = value.match(/^(\w|\.)*$/g) && !(value === "true" || value === "false" || !Number.isNaN(Number.parseFloat(value)));
      //We only revert mapping entries that are simpel and relevant
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

  /**
   * Function that builds mapping pairs for keys in provided and required that are identical
   *
   * @param provided The provided interface
   * @param required The reuired interface
   */
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
   *
   * @param source The source interface
   * @param targets The target interfaces
   */
  public async buildMappingPairs(source: IInterface, targets: { [key: string]: IInterface }): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const sourceId = `${source.api.id}_${source.operationId}_${source.responseId}`;
    const targetIds = Object.keys(targets);

    const mappings: ParsedMapping[] = (await this.getMappings()).map(m => {
      const requestMapping = flatten(JSON.parse(m.requestMapping));
      const requestMappingInputKeys = Object.entries(requestMapping).reduce((obj, [key, value]) => ({
        ...obj,
        [key]: getinputs(`{"${key}": ${value}}`).getInputs({}) as string[]
      }), {});

      const responseMapping = flatten(JSON.parse(m.responseMapping));
      const responseMappingInputKeys = Object.entries(responseMapping).reduce((obj, [key, value]) => ({
        ...obj,
        [key]: getinputs(`{"${key}": ${value}}`).getInputs({}) as string[]
      }), {})
      if (m.targetIds.some(tId => targetIds.includes(tId))) {
        Object.keys(responseMapping).forEach(k => {
          if (!responseMappingInputKeys[k].every(reference => targetIds.some(tK => reference.startsWith(tK)))) {
            delete responseMapping[k];
          }
        })
      }

      return {
        ...m,
        requestMapping,
        requestMappingInputKeys,
        responseMapping,
        responseMappingInputKeys
      }
    });
    //For each of the target APIs, create trees that start at the source API and end at the specific target API.
    //Finally, flat-map all those trees into one array
    const mappingTrees = targetIds.map(id => this.treeSearch(sourceId, id, mappings)).reduce((flat, trees) => [...flat, ...trees], []);

    let responseMapping = {};
    let requestMapping = {};

    const sourceResponseBody = await this.validationService.getSourceResponseBody(source);
    const targetRequestBodies = await this.validationService.getTargetRequestBodies(targets);
    //Now we build the final mappings by executing each identified mapping tree. The results get merged together into one request and response mapping.
    this.count = 0;
    for (const mappingTree of mappingTrees) {
      const { requestMapping: reqMap, responseMapping: resMap, break: breakLoop } = this.executeMappingTree(mappingTree, source, targets, sourceResponseBody, targetRequestBodies);
      responseMapping = { ...responseMapping, ...resMap };
      requestMapping = { ...requestMapping, ...reqMap };
      if (breakLoop) break;
    }

    Object.keys(requestMapping).forEach(k => {
      if(!targetIds.some(tId => k.startsWith(tId))) {
        delete requestMapping[k];
      }
    })
    requestMapping = unflatten(requestMapping);
    responseMapping = unflatten(responseMapping);

    return {
      request: this.transToMappingPairs(requestMapping, MappingDirection.INPUT),
      response: this.transToMappingPairs(responseMapping, MappingDirection.OUTPUT)
    }
  }

  /**
   * Finds all paths from a source API to a traget API and builds an acyclic tree as result.
   *
   * Restrictions: In each path, no vertex (i.e. API) is allowed to be visited twice.
   * Implicit restriction: No edge (i.e. Mapping) is allowed to be visited twice (as a result of the prev. restriction)
   *
   * @param sourceId The ID of the starting API
   * @param finalTragetId the ID of the target API
   * @param mappings A list of all existing mappings
   * @param visitedApis A list of APIs (i.e. vertices) that were already visited
   */
  private treeSearch(sourceId: string, finalTragetId: string, mappings: Array<ParsedMapping>, visitedApis: Array<string> = []): Tree[] {
    //From all mappings, get the ones that match the source ID and that have not yet been visited
    const sources = mappings.filter(m => m.sourceId === sourceId && !visitedApis.includes(sourceId));

    const result = new Array<Tree>();
    //This double loop makes it so that each 1:n mapping is treated somewhat like a 1:1 mapping
    for (const source of sources) {
      for (const targetId of source.targetIds) {
        if (targetId === finalTragetId) {
          //If one target ID matches our final target API, we add the mapping without any children to the tree
          result.push({ node: source });
        } else {
          //If the target ID does not yet match the final target, we execute the recursion step, resulting in a DFS
          const children = this.treeSearch(targetId, finalTragetId, mappings, [...visitedApis, sourceId]);
          //We only add a node to the final tree, if we have found any children that lead to the target. If not, we ignore this branch.
          //This makes it so that in the final tree all leafs end in the target API
          if (children.length > 0) {
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

  /**
   * Marges two mappings into one (i.e. A -> B and B -> C become A -> C).
   *
   * Gets all keys from the input (i.e. some mapping). Filters out key which values include references to an API that is neither source nor target.
   * Filtering is done to prevent having mappings that access keys from APIs other than the source or target(s).
   * Afterwards, loops through all key of the mapping that should be altered. If a value includes any key from the input, this key is replaced by the value from the input.
   *
   * @param input The mapping from B -> C
   * @param mapping The Mapping from A -> B
   * @param sourceId The ID of the source API, required for filtering
   * @param targetIds The IDs of all target APIs, required for filtering
   *
   * @returns A combined mapping from "mapping.source" to "input.target"
   */
  private performResponseMapping(input: { [key: string]: string }, mapping: { [key: string]: string }, mappingInputKeys: { [key: string]: string[] }) {
    const inputKeys = Object.keys(input);
    const result: { [key: string]: string } = {};

    //For each entry in the mapping, try to replace a key from the input with a value from the input
    for (const [key, value] of Object.entries(mapping)) {
      //If a mapping entry requires value from a source other the the current input source API, skip it
      if (!mappingInputKeys[key].every(k => inputKeys.includes(k))) {
        continue;
      }
      //TODO: This is too processor heavy -> improve performance
      result[key] = inputKeys.reduce((val, k) => val.replace(new RegExp(k, 'g'), operators.some(o => input[k].includes(o)) ? `(${input[k]})` : input[k]), value);
    }

    return result;
  }

  private performRequestMapping(input: { [key: string]: string }, mapping: { [key: string]: string }) {
    const inputKeys = Object.keys(input);
    const result: { [key: string]: string } = {};

    //TODO: This is too processor heavy -> improve performance
    //For each entry in the mapping, try to replace a key from the input with a value from the input
    for (const [key, value] of Object.entries(mapping)) {
      result[key] = inputKeys.reduce((val, k) => val.replace(new RegExp(k, 'g'), operators.some(o => input[k].includes(o)) ? `(${input[k]})` : input[k]), value);
    }

    return result;
  }

  /**
   * Builds the final request and response mappings from the identified mapping tree.
   *
   * @param mappingTree The input mapping tree
   * @param sourceId The ID of the source API, required for filtering
   * @param targetIds The IDs of all target APIs, required for filtering
   * @param requestInput The processed request mapping so far (required, as it needs to be passed downards the tree)
   */
  private executeMappingTree(mappingTree: Tree, source: IInterface, targets: { [key: string]: IInterface }, sourceResponseBody: object, targetRequestBodies: object, requestInput?: { [key: string]: string }) {
    const { node, children } = mappingTree;

    //The request mapping that is passed back from the leafs to the root
    let requestMapping = {};
    //The mapping that is created by applying the node's req Mapping on the input
    let newRequestInput: { [key: string]: string } = {};

    if (requestInput === undefined) {
      //If it is the first step and request input is undefined, we set the first request mapping as input
      newRequestInput = node.requestMapping;
    } else {
      //If there is already a request input set, we apply the current mapping on the input
      newRequestInput = this.performRequestMapping(requestInput, node.requestMapping);
    }

    //The combined input (i.e. mappings) from all children
    if (children === undefined) {
      //Current element is a leaf, so we use the response mapping as an input
      //We don't need to sanitize the response mapping here, because we already remove all mappings that point to 3rd APIs when we parse the mapping
      return { responseMapping: node.responseMapping, requestMapping: newRequestInput };
    }

    let responseInput: { [key: string]: string } = {};
    //Current element is not a leaf, so we continue the recursion
    for (const child of children) {
      const result = this.executeMappingTree(child, source, targets, sourceResponseBody, targetRequestBodies, newRequestInput);
      if (result.break) {
        return result;
      }
      //Once we get the result, we merge the values for response and request
      responseInput = {
        ...responseInput,
        ...result.responseMapping
      }
      requestMapping = {
        ...requestMapping,
        ...result.requestMapping
      }
    }

    //Finally, we apply the current response mapping the the response input (i.e. the merged inputs from all children)
    const responseMapping = this.performResponseMapping(responseInput, node.responseMapping, node.responseMappingInputKeys);

    const requestMappingValid = this.validationService.findMissing(requestMapping, targetRequestBodies).length === 0;
    const responseMappingValid = this.validationService.findMissing(responseMapping, sourceResponseBody).length === 0;
    this.count++;
    if (requestMappingValid && responseMappingValid) {
      return { responseMapping, requestMapping, break: true };
    }

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
