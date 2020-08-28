import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFirestoreCollection } from '@angular/fire/firestore/public_api';
import { flatten, unflatten } from 'flat';
import { IOpenApiInterface } from '../models/openapi-interface.model';
import { IOpenApiMapping } from '../models/openapi-mapping.model';
import * as getinputs from '../utils/get-inputs/get-inputs';
import { removeUndefined } from '../utils/remove-undefined';
import { AuthenticationService } from './authentication.service';
import createSha1Hash from '../utils/buildHash';
import { ValidationService } from './validation.service';
import { IAsyncApiMapping } from '../models/asyncapi-mapping.model';
import { IAsyncApiInterface } from '../models/asyncapi-interface.model';
import { IMappingPair, MappingType, MappingDirection, IMapping } from '../models/mapping.model';
import { KeyChain } from './jsontree.service';

type Tree = { node: ParsedOpenApiMapping | ParsedAsyncApiMapping, children?: Tree[] }
type OpenApiTree = { node: ParsedOpenApiMapping, children?: OpenApiTree[] };
type ParsedOpenApiMapping = Omit<IOpenApiMapping, "requestMapping" | "responseMapping"> & { requestMapping: { [key: string]: string }, requestMappingInputKeys: { [key: string]: string[] }, responseMapping: { [key: string]: string }, responseMappingInputKeys: { [key: string]: string[] } }
type AsyncApiTree = { node: ParsedAsyncApiMapping, children?: AsyncApiTree[] };
type ParsedAsyncApiMapping = Omit<IAsyncApiMapping, "messageMappings"> & { messageMappings: { [targetId: string]: { [key: string]: string } }, messageMappingsInputKeys: { [targetId: string]: { [key: string]: string[] } } }
const operatorsRegex = /(=|!|\+|-|\*|\/|>|<|\sand\s|\sor\s|\sin\s|&|%)(?!((\w|-)*?"$)|((\w|-)*?"\."))/g;

@Injectable({
  providedIn: 'root'
})
export class MappingService {

  private readonly openApiMappingColl = this.firestore.collection<IOpenApiMapping>('openApiMappings');
  private readonly asyncApiMappingColl = this.firestore.collection<IAsyncApiMapping>('asyncApiMappings');

  constructor(
    private identificationService: AuthenticationService,
    private firestore: AngularFirestore,
    private validationService: ValidationService
  ) { }

  /**
   * Get all mappings from the database
   * @param conditions A set of conditions that are applied when getting the results
   */
  public async getOpenApiMappings(conditions: { [key: string]: any } = {}): Promise<Array<IOpenApiMapping>> {
    return this.getMappings(this.openApiMappingColl, conditions);
  }

  public async getAsyncApiMappings(conditions: { [key: string]: any } = {}): Promise<Array<IAsyncApiMapping>> {
    return this.getMappings(this.asyncApiMappingColl, conditions);
  }

  private async getMappings<T = IOpenApiMapping | IAsyncApiMapping>(collection: AngularFirestoreCollection, conditions: { [key: string]: any } = {}): Promise<Array<T>> {
    const mappings = (await collection.get().toPromise()).docs.map(doc => this.parseMapping<T>(doc.id, doc.data()));
    const filteredMappings = mappings.filter(mapping => Object.entries(conditions).every(([key, value]) => mapping[key] === value));

    return filteredMappings;
  }

  /**
   * Get a single mapping by id
   * @param id The id of the mapping that schould be retrieved
   */
  public async getOpenApiMapping(id: string): Promise<IOpenApiMapping> {
    return this.getMapping(this.openApiMappingColl, id);
  }

  public async getAsyncApiMapping(id: string): Promise<IAsyncApiMapping> {
    return this.getMapping(this.asyncApiMappingColl, id);
  }

  private async getMapping<T>(collection: AngularFirestoreCollection, id: string): Promise<T> {
    const doc = await collection.doc<T>(id).get().toPromise();
    return this.parseMapping<T>(doc.id, doc.data());
  }

  /**
   * Store a mapping in the database
   * @param mapping
   */
  public async createOpenApiMapping(mapping: IOpenApiMapping) {
    const reverseMappings = this.buildOpenApiReverseMappings(mapping);

    //Only primary mapping mandatory to be written. We ignore if reverse mappings create errors
    return Promise.all([
      this.openApiMappingColl.doc(await createSha1Hash(mapping.requestMapping + mapping.responseMapping)).set(this.serializeMapping(mapping)),
      ...reverseMappings.map(async (m) => {
        const id = await createSha1Hash(m.requestMapping + m.responseMapping);
        return this.openApiMappingColl.doc(id).set(this.serializeMapping(m)).finally();
      })
    ]);
  }

  public async createAsyncApiMapping(mapping: IAsyncApiMapping) {
    const reverseMappings = this.buildAsyncApiReverseMappings(mapping);

    //Only primary mapping mandatory to be written. We ignore if reverse mappings create errors
    return Promise.all([
      this.asyncApiMappingColl.doc(await createSha1Hash(Object.values(mapping.messageMappings).join(''))).set(this.serializeMapping(mapping)),
      ...reverseMappings.map(async (m) => {
        const id = await createSha1Hash(Object.values(m.messageMappings).join(''));
        return this.asyncApiMappingColl.doc(id).set(this.serializeMapping(m)).finally();
      })
    ]);
  }

  /**
   * Updates a mapping in the database
   * @param mapping
   */
  public async updateOpenApiMapping(mapping: IOpenApiMapping) {
    return this.openApiMappingColl.doc(mapping.id).update(this.serializeMapping(mapping));
  }

  public async updateAsyncApiMapping(mapping: IAsyncApiMapping) {
    return this.asyncApiMappingColl.doc(mapping.id).update(this.serializeMapping(mapping));
  }

  private parseMapping<T = IOpenApiMapping | IAsyncApiMapping>(id: string, mapping: any): T {
    return {
      ...mapping,
      id
    }
  }

  private serializeMapping(mapping: IOpenApiMapping | IAsyncApiMapping) {
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
  public buildOpenApiMapping(source: IOpenApiInterface, targets: { [key: string]: IOpenApiInterface }, requestMappingPairs: Array<IMappingPair>, responseMappingPairs: Array<IMappingPair>, type: MappingType): IOpenApiMapping {
    const requestTransformation = this.mappingPairsToTrans(requestMappingPairs);
    const responseTransformation = this.mappingPairsToTrans(responseMappingPairs);

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

  public buildAsyncApiMapping(source: IAsyncApiInterface, targets: { [key: string]: IAsyncApiInterface }, messageMappingPairs: Array<IMappingPair>, direction: MappingDirection, type: MappingType): IAsyncApiMapping {
    const clusteredMappingPairs: { [key: string]: Array<IMappingPair> } = {};

    if (direction === MappingDirection.INPUT) {
      //target = provided
      for (const mappingPair of messageMappingPairs) {
        clusteredMappingPairs[mappingPair.provided[0][0]] = [...(clusteredMappingPairs[mappingPair.provided[0][0]] || []), mappingPair]
      }
    } else if (direction === MappingDirection.OUTPUT) {
      //target = required
      for (const mappingPair of messageMappingPairs) {
        clusteredMappingPairs[mappingPair.required[0]] = [...(clusteredMappingPairs[mappingPair.required[0]] || []), mappingPair]
      }
    }

    const messageMappings = Object.keys(targets).reduce((result, targetId) => {
      return {
        ...result,
        [targetId]: JSON.stringify(this.mappingPairsToTrans(clusteredMappingPairs[targetId] || []))
      }
    }, {})

    console.log(targets);
    console.log(Object.entries(targets).reduce((obj, [targetId, value]) => ({...obj, [targetId]: value.url}), {}));
    return {
      id: undefined,
      createdBy: this.identificationService.User.uid,
      type: type,
      sourceId: `${source.api.id}_${source.operationId}`,
      targetIds: Object.keys(targets),
      topics: {
        source: source.url,
        targets: Object.entries(targets).reduce((obj, [targetId, value]) => ({...obj, [targetId]: value.url}), {})
      },
      messageMappings,
      direction
    }
  }

  /**
   * Creates a symmetrical, "reverted" mapping for a mapping that is about to be stored in the database.
   *
   * @param mapping The mapping that should be reverted
   */
  private buildOpenApiReverseMappings(mapping: IOpenApiMapping): Array<IOpenApiMapping> {
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

  private buildAsyncApiReverseMappings(mapping: IAsyncApiMapping): Array<IAsyncApiMapping> {
    return mapping.targetIds.map(targetId => ({
      id: undefined,
      sourceId: targetId,
      targetIds: [mapping.sourceId],
      createdBy: mapping.createdBy,
      type: MappingType.REVERSE,
      topics: {
        source: mapping.topics.targets[targetId],
        targets: {
          [mapping.sourceId]: mapping.topics.source
        }
      },
      messageMappings: { [mapping.sourceId]: this.reverseTransformation([targetId, mapping.sourceId], mapping.messageMappings[targetId]) },
      direction: mapping.direction
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
      const simple = value.match(/(^\$(\."(\w|-)+")+$)|(^(\w|\.)*$)/g) && !(value === "true" || value === "false" || !Number.isNaN(Number.parseFloat(value)));
      if (!simple) return reversed;

      //Deconstruct escaped keys
      if (value.startsWith('$')) {
        value = value.split('.').slice(1).map(v => v.slice(1, -1)).join('.')
      }
      //The mapping is only relevant if both that key and the value side of the mapping refer to an API inside the prefixes
      const relevant = prefixes.some(p => key.startsWith(p)) && prefixes.some(p => value.startsWith(p));
      //A mapping is only simple, if it containes no logic at all so it simply maps one key to another one
      //We only revert mapping entries that are simpel and relevant
      if (!relevant) return reversed;

      return {
        ...reversed,
        [value]: buildJSONataKey(key.split('.')),
      }

    }, {});

    return JSON.stringify(unflatten(reversedMapping));
  }

  /**
   * Creates a JSONata mapping from an arrray of mapping pairs
   * @param mappingPairs A list of mapping pairs that will build the transformation
   */
  private mappingPairsToTrans(mappingPairs: Array<IMappingPair>) {
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
  public buildSameMappingPairs(provided: any, required: any, split: boolean = false): Array<IMappingPair> {
    if (split) {
      return this.buildSameMappingPairsSplit(provided, required);
    } else {
      return this.buildSameMappingPairsNoSplit(provided, required);
    }
  }

  private buildSameMappingPairsNoSplit(provided: any, required: any) {
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
              mappingCode: buildJSONataKey(providedKey.split('.')),
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

  private buildSameMappingPairsSplit(provided: any, required: any) {
    const mappingPairs = new Array<IMappingPair>();

    const flatProvided = flatten(provided);
    const flatRequired = flatten(required);

    for (const providedKey of Object.keys(flatProvided)) {
      for (const requiredKey of Object.keys(flatRequired)) {
        const unprefixedProvidedKey = providedKey.substr(providedKey.indexOf('.') + 1);
        const unprefixedRequiredKey = requiredKey.substr(requiredKey.indexOf('.') + 1);

        if (unprefixedProvidedKey === unprefixedRequiredKey) {
          const mappingPair = {
            mappingCode: buildJSONataKey(providedKey.split('.')),
            provided: [providedKey.split('.')],
            required: requiredKey.split('.')
          }
          mappingPairs.push(mappingPair);
        }
      }
    }

    return mappingPairs;
  }

  /**
   * Create mapping pairs based on a source and target interface, taking transitive chains into account
   *
   * @param source The source interface
   * @param targets The target interfaces
   */
  public async buildOpenApiMappingPairs(source: IOpenApiInterface, targets: { [key: string]: IOpenApiInterface }): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const sourceId = `${source.api.id}_${source.operationId}_${source.responseId}`;
    const targetIds = Object.keys(targets);

    const mappings: { [key: string]: ParsedOpenApiMapping[] } = (await this.getOpenApiMappings()).reduce((obj, m) => {
      const flatRequestMapping: { [key: string]: string } = flatten(JSON.parse(m.requestMapping));

      const requestMapping = {};
      const requestMappingInputKeys = {};
      for (const key in flatRequestMapping) {
        const value = flatRequestMapping[key];
        requestMapping[key] = operatorsRegex.test(value) ? `(${value})` : value;
        requestMappingInputKeys[key] = getinputs(`{"${key}": ${value}}`).getInputs({}) as string[];
      }

      const flatResponseMapping: { [key: string]: string } = flatten(JSON.parse(m.responseMapping));

      const responseMapping = {};
      const responseMappingInputKeys = {};

      const mappingPointsToTarget = targetIds.some(tId => m.targetIds.includes(tId));
      if (mappingPointsToTarget) {
        for (const key in flatResponseMapping) {
          const value = flatResponseMapping[key];
          const inputs = getinputs(`{"${key}": ${value}}`).getInputs({}) as string[];

          responseMappingInputKeys[key] = inputs;

          if (inputs.every(input => targetIds.some(tId => input.indexOf(tId) === 0))) {
            responseMapping[key] = operatorsRegex.test(value) ? `(${value})` : value;
          }
        }
      } else {
        for (const key in flatResponseMapping) {
          const value = flatResponseMapping[key];
          responseMappingInputKeys[key] = getinputs(`{"${key}": ${value}}`).getInputs({}) as string[];
          responseMapping[key] = operatorsRegex.test(value) ? `(${value})` : value;
        }
      }

      const parsedMapping: ParsedOpenApiMapping = {
        ...m,
        requestMapping,
        requestMappingInputKeys,
        responseMapping,
        responseMappingInputKeys
      };

      return {
        ...obj,
        [parsedMapping.sourceId]: [...(obj[parsedMapping.sourceId] || []), parsedMapping]
      }
    }, {});
    //For each of the target APIs, create trees that start at the source API and end at the specific target API.
    //Finally, flat-map all those trees into one array
    let mappingTrees: OpenApiTree[] = [];
    for (let i = 0; i < targetIds.length; i++) {
      const result = this.treeSearch(sourceId, targetIds[i], mappings) as OpenApiTree[];
      mappingTrees = [...mappingTrees, ...result];
    }

    let responseMapping = {};
    let requestMapping = {};

    const [requiredSourceKeys, requiredTargetKeys] = await Promise.all([
      this.validationService.getSourceResponseBody(source).then(b => flatten(b)).then(f => Object.keys(f)),
      this.validationService.getTargetRequestBodies(targets).then(b => flatten(b)).then(f => Object.keys(f))
    ]);

    //Now we build the final mappings by executing each identified mapping tree. The results get merged together into one request and response mapping.
    for (let i = 0; i < mappingTrees.length; i++) {
      const { requestMapping: reqMap, responseMapping: resMap, break: breakLoop } = this.executeOpenApiMappingTree(mappingTrees[i], requiredSourceKeys, requiredTargetKeys);
      responseMapping = { ...responseMapping, ...resMap };
      requestMapping = { ...requestMapping, ...reqMap };
      if (breakLoop) break;
    }

    //Clean request mapping so that it does not contain any references to APIs other than the targets
    for (const key in requestMapping) {
      if (!targetIds.some(tId => key.indexOf(tId) === 0)) {
        delete requestMapping[key];
      }
    }

    requestMapping = unflatten(requestMapping);
    responseMapping = unflatten(responseMapping);

    return {
      request: this.transToMappingPairs(requestMapping),
      response: this.transToMappingPairs(responseMapping)
    }
  }

  public async buildAsyncApiMappingPairs(source: IAsyncApiInterface, targets: { [key: string]: IAsyncApiInterface }, direction: MappingDirection): Promise<Array<IMappingPair>> {
    const sourceId = `${source.api.id}_${source.operationId}`;
    const targetIds = Object.keys(targets);

    const mappings: { [key: string]: ParsedAsyncApiMapping[] } = (await this.getAsyncApiMappings({ direction })).reduce((obj, m) => {
      const messageMappings: { [targetId: string]: { [key: string]: string } } = {};
      const messageMappingsInputKeys: { [targetId: string]: { [key: string]: string[] } } = {};
      for (const targetId in m.messageMappings) {
        const flattened = flatten(JSON.parse(m.messageMappings[targetId]));
        messageMappings[targetId] = {};
        messageMappingsInputKeys[targetId] = {};

        for (const key in flattened) {
          const value = flattened[key];
          messageMappings[targetId][key] = operatorsRegex.test(value) ? `(${value})` : value;
          messageMappingsInputKeys[targetId][key] = getinputs(`{"${key}": ${value}}`).getInputs({}) as string[];
        }
      }

      const parsedMapping: ParsedAsyncApiMapping = {
        ...m,
        messageMappings,
        messageMappingsInputKeys
      };

      return {
        ...obj,
        [parsedMapping.sourceId]: [...(obj[parsedMapping.sourceId] || []), parsedMapping]
      }
    }, {});

    //TODO: Reenable as soon as concurrency bug is fixed
    // const [requiredSourceKeys, requiredTargetKeys] = await Promise.all([
    //   this.validationService.getSourceMessageBody(source).then(b => flatten(b)).then(f => Object.keys(f)),
    //   this.validationService.getTargetMessageBodies(targets).then(b => flatten(b)).then(f => Object.keys(f))
    // ]);
    const requiredSourceKeys = await this.validationService.getSourceMessageBody(source).then(b => flatten(b)).then(f => Object.keys(f));
    const requiredTargetKeys = await this.validationService.getTargetMessageBodies(targets).then(b => flatten(b)).then(f => Object.keys(f));

    let messageMappings: { [targetId: string]: { [key: string]: string } } = {};

    //For each of the target APIs, create trees that start at the source API and end at the specific target API.
    //Finally, flat-map all those trees into one array
    for (let i = 0; i < targetIds.length; i++) {
      const mappingTrees = this.treeSearch(sourceId, targetIds[i], mappings) as AsyncApiTree[];

      let subresult: { [key: string]: string } = {}
      if (direction === MappingDirection.INPUT) {
        for (let j = 0; j < mappingTrees.length; j++) {
          const { messageMappings: msgMap, break: breakLoop } = this.executeAsyncApiMappingTreeSubscribe(mappingTrees[j], requiredSourceKeys);
          subresult = { ...subresult, ...msgMap[targetIds[i]] };
          if (breakLoop) break;
        }

        //Clean mapping
        for (const key in subresult) {
          if (key.indexOf(sourceId) !== 0) {
            delete subresult[key];
          }
        }
      } else if (direction === MappingDirection.OUTPUT) {
        for (let j = 0; j < mappingTrees.length; j++) {
          const { messageMapping: msgMap, break: breakLoop } = this.executeAsyncApiMappingTreePublish(mappingTrees[j], targetIds[i], requiredTargetKeys);
          subresult = { ...subresult, ...msgMap };
          if (breakLoop) break;
        }

        //Clean mapping
        for (const key in subresult) {
          if (!targetIds.some(tId => key.indexOf(tId) === 0)) {
            delete subresult[key];
          }
        }
      }

      messageMappings = { ...messageMappings, [targetIds[i]]: subresult };
    }

    const mappingPairs: Array<IMappingPair> = [];
    for (const targetId in messageMappings) {
      const singleMapping = unflatten(messageMappings[targetId]);
      mappingPairs.push(...this.transToMappingPairs(singleMapping));
    }

    return mappingPairs;
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
  private treeSearch(sourceId: string, finalTragetId: string, mappings: { [key: string]: (ParsedOpenApiMapping | ParsedAsyncApiMapping)[] }, visitedApis: Array<string> = []): Tree[] {
    //From all mappings, get the ones that match the source ID and that have not yet been visited
    const sources = mappings[sourceId] || [];

    const result: Tree[] = [];
    //This double loop makes it so that each 1:n mapping is treated somewhat like a 1:1 mapping
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      for (let j = 0; j < source.targetIds.length; j++) {
        const targetId = source.targetIds[j];

        if (targetId === finalTragetId) {
          //If one target ID matches our final target API, we add the mapping without any children to the tree
          result.push({ node: source });
        } else if (!(visitedApis.includes(targetId) || sourceId === targetId)) {
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
  private transToMappingPairs(transformation: any, keyChain: Array<string> = []): Array<IMappingPair> {
    const result = new Array<IMappingPair>();

    for (const key in transformation) {
      if (typeof transformation[key] === "object" && !(transformation[key] instanceof Array)) {
        result.push(...this.transToMappingPairs(transformation[key], [...keyChain, key]));
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
    const simpleRegex = new RegExp(inputKeys.join('|'), 'g');
    const extendedInputKeys = inputKeys.map(k => `\\$$\\.${k.split('.').map(p => `"${p}"`).join('\\.')}`);
    const extendedRegex = new RegExp(extendedInputKeys.join('|'), 'g');

    const result: { [key: string]: string } = {};

    //For each entry in the mapping, try to replace a key from the input with a value from the input
    for (const key in mapping) {
      //If a mapping entry requires value from a source other the the current input source API, skip it
      if (!mappingInputKeys[key].every(k => inputKeys.includes(k))) {
        continue;
      }

      result[key] = mapping[key].replace(simpleRegex, (match) => input[match]);
      result[key] = result[key].replace(extendedRegex, (match) => {
        const resultingKey = match.split('.').slice(1).map(v => v.slice(1, -1)).join('.')
        return input[resultingKey];
      });
    }

    return result;
  }

  private performRequestMapping(input: { [key: string]: string }, mapping: { [key: string]: string }) {
    const inputKeys = Object.keys(input);
    const simpleRegex = new RegExp(inputKeys.join('|'), 'g');
    const extendedInputKeys = inputKeys.map(k => `\\$$\\.${k.split('.').map(p => `"${p}"`).join('\\.')}`);
    const extendedRegex = new RegExp(extendedInputKeys.join('|'), 'g');

    const result: { [key: string]: string } = {};

    //For each entry in the mapping, try to replace a key from the input with a value from the input
    for (const key in mapping) {
      result[key] = mapping[key].replace(simpleRegex, (match) => input[match]);
      result[key] = result[key].replace(extendedRegex, (match) => {
        const resultingKey = match.split('.').slice(1).map(v => v.slice(1, -1)).join('.')
        return input[resultingKey];
      });
    }

    return result;
  }

  private performMessageMapping(input: { [targetId: string]: { [key: string]: string } }, mapping: { [key: string]: string }) {
    const targetIds = Object.keys(input);
    const result: { [targetId: string]: { [key: string]: string } } = {};

    for (let i = 0; i < targetIds.length; i++) {
      const inputKeys = Object.keys(input[targetIds[i]]);
      const simpleRegex = new RegExp(inputKeys.join('|'), 'g');
      const extendedInputKeys = inputKeys.map(k => `\\$\\.${k.split('.').map(p => `"${p}"`).join('\\.')}`);
      const extendedRegex = new RegExp(extendedInputKeys.join('|'), 'g');

      const subresult: { [key: string]: string } = {};

      //For each entry in the mapping, try to replace a key from the input with a value from the input
      for (const key in mapping) {
        subresult[key] = mapping[key].replace(simpleRegex, (match) => input[targetIds[i]][match]);
        subresult[key] = subresult[key].replace(extendedRegex, (match) => {
          const resultingKey = match.split('.').slice(1).map(v => v.slice(1, -1)).join('.')
          return input[targetIds[i]][resultingKey];
        });
      }

      result[targetIds[i]] = subresult;
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
  private executeOpenApiMappingTree(mappingTree: OpenApiTree, requiredSourceKeys: string[], requiredTargetKeys: string[], requestInput?: { [key: string]: string }): { responseMapping: { [key: string]: string }, requestMapping: { [key: string]: string }, break?: boolean } {
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
    for (let i = 0; i < children.length; i++) {
      const result = this.executeOpenApiMappingTree(children[i], requiredSourceKeys, requiredTargetKeys, newRequestInput);
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

    const providedSourceKeys = Object.keys(responseMapping);
    const providedTargetKeys = Object.keys(requestMapping);

    const requestMappingValid = requiredTargetKeys.every(reqKey => providedTargetKeys.includes(reqKey));
    const responseMappingValid = requiredSourceKeys.every(reqKey => providedSourceKeys.includes(reqKey));

    return { responseMapping, requestMapping, break: requestMappingValid && responseMappingValid };
  }

  private executeAsyncApiMappingTreeSubscribe(mappingTree: AsyncApiTree, requiredKeys: string[]): { messageMappings: { [targetId: string]: { [key: string]: string } }, break?: boolean } {
    const { node, children } = mappingTree;

    if (children === undefined) {
      return { messageMappings: node.messageMappings };
    }

    const messageMappings: { [targetId: string]: { [key: string]: string } } = {};

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const result = this.executeAsyncApiMappingTreeSubscribe(child, requiredKeys);
      if (result.break) {
        return result;
      }
      const msgMappings = this.performMessageMapping(result.messageMappings, node.messageMappings[child.node.sourceId]);
      for (const targetId in msgMappings) {
        messageMappings[targetId] = { ...(messageMappings[targetId] || {}), ...msgMappings[targetId] };
      }
    }

    const providedMappingKeys = Object.values(messageMappings).map(m => Object.keys(m));
    //For all provided keys of all mappings
    const messageMappingValid = providedMappingKeys.every(providedKeys => requiredKeys.every(key => providedKeys.includes(key)))

    return { messageMappings, break: messageMappingValid };
  }

  private executeAsyncApiMappingTreePublish(mappingTree: AsyncApiTree, finalTargetId: string, requiredKeys: string[]): { messageMapping: { [key: string]: string }, break?: boolean } {
    const { node, children } = mappingTree;

    if (children === undefined) {
      return { messageMapping: node.messageMappings[finalTargetId] };
    }

    let messageMapping: { [key: string]: string } = {};

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const result = this.executeAsyncApiMappingTreePublish(child, finalTargetId, requiredKeys);
      if (result.break) {
        return result;
      }
      const msgMappings = this.performRequestMapping(node.messageMappings[child.node.sourceId], result.messageMapping);
      messageMapping = { ...messageMapping, ...msgMappings };
    }

    const providedMappingKeys = Object.keys(messageMapping);
    const messageMappingValid = requiredKeys.every(key => providedMappingKeys.includes(key))

    return { messageMapping, break: messageMappingValid };
  }

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

export function buildJSONataKey(keyChain: KeyChain): string {
  const needsEscaping = keyChain.some(k => k.includes('-'));
  if (!needsEscaping) {
    return keyChain.join('.');
  }
  return `$.${keyChain.map(k => `"${k}"`).join('.')}`;
}
