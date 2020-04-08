import { Injectable } from "@angular/core";
import { HttpClient } from '@angular/common/http';
import { IMapping, IMappingPair, MappingType } from '../models/mapping.model';
import { mappingEndpoint } from '~/app/app.config';
import { IInterface } from '../models/interface.model';
import * as merge from 'deepmerge';
import * as jsonata from 'jsonata';
import { KeyChain } from './jsontree.service';
import { IdentificationService } from './identification.service';

@Injectable({
  providedIn: 'root'
})
export class MappingService {

  constructor(private identificationService: IdentificationService, private httpClient: HttpClient) { }

  /**
   * Get all mappings from the database
   * @param conditions A set of conditions that are applied when getting the results
   */
  public async getMappings(conditions?: { [key: string]: any }): Promise<Array<IMapping>> {
    const filter = conditions && "?" + Object.entries(conditions).map(e => {
      const filterObject = {};
      filterObject[e[0]] = e[1];
      return "filter=" + JSON.stringify(filterObject);
    }).join("&");
    const endpoint = mappingEndpoint + (filter || '');
    const rawResult = await this.httpClient.get<Array<IMapping>>(endpoint).toPromise();
    return rawResult.map(mapping => this.parseMapping(mapping));
  }

  /**
   * Get a single mapping by id
   * @param id The id of the mapping that schould be retrieved
   */
  public async getMapping(id: string): Promise<IMapping> {
    const rawResult = await this.httpClient.get<IMapping>(`${mappingEndpoint}/${id}`).toPromise();
    return this.parseMapping(rawResult);
  }

  /**
   * Store a mapping in the database
   * @param mapping
   */
  public async createMapping(mapping: IMapping) {
    return this.httpClient.post(mappingEndpoint, mapping).toPromise();
  }

  private parseMapping(mapping: any): IMapping {
    return {
      id: mapping._id["$oid"] || mapping._id,
      createdBy: mapping.createdBy,
      type: mapping.type,
      sourceId: mapping.sourceId,
      targetId: mapping.targetId,
      requestMapping: mapping.requestMapping,
      responseMapping: mapping.responseMapping
    }
  }

  private serializeMapping(mapping: IMapping) {
    return {
      createdBy: mapping.createdBy,
      type: mapping.type,
      sourceId: mapping.sourceId,
      targetId: mapping.targetId,
      requestMapping: mapping.requestMapping,
      responseMapping: mapping.responseMapping
    }
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

      if (mapping.targetId === targetId) {
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
      createdBy: this.identificationService.UserName,
      type: type,
      sourceId: source.id,
      targetId: target.id,
      requestMapping: JSON.stringify(requestTransformation),
      responseMapping: JSON.stringify(responseTransformation)
    }
  }

  /**
   * Creates a JSONata mapping from an arrray of mapping pairs
   * @param mappingPairs A list of mapping pairs that will build the transformation
   */
  private mappingPairsToTrans(mappingPairs: Array<IMappingPair>, direction: MappingDirection) {
    return merge.all(mappingPairs.map(p => {
      let toBeMapped: KeyChain;
      switch (direction) {
        //If we are mapping an input, we need to map values from the source to the target, hence we use target as reference
        case MappingDirection.INPUT: toBeMapped = p.target; break;
        //If we are mapping an output, we need to map values from the target to the source, hence we use source as reference
        case MappingDirection.OUTPUT: toBeMapped = p.source; break;
        default: throw new Error("Unknown mapping direction");
      }

      return toBeMapped.reduceRight((child: any, curr: string) => {
        let obj: any = {};
        obj[curr] = child;
        return obj;
      }, p.target.join('.'));
    }));
  }

  /**
   * Create mapping pairs based on a source and target interface, taking transitive chains into account
   * @param source The source interface
   * @param target The target interface
   */
  public async buildMappingPairs(source: IInterface, target: IInterface): Promise<{ request: Array<IMappingPair>, response: Array<IMappingPair> }> {
    const mappingChain = await this.findMappingChain(source.id, target.id);

    if (!mappingChain || mappingChain.length === 0) return { request: [], response: [] }

    const resultingMapping = this.executeMappingChain(mappingChain);

    return {
      request: this.transToMappingPairs(JSON.parse(resultingMapping.requestMapping)),
      response: this.transToMappingPairs(JSON.parse(resultingMapping.responseMapping))
    }
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
        result.push({
          source: [...keyChain, key],
          target: transformation[key].split('.')
        });
      }
    }

    return result;
  }

  /**
   * Executes a chain of mappings, resulting in a new mapping that maps from the source of the first mapping to the target of the last mapping
   * @param mappingChain The transitive chain of mappings
   */
  private executeMappingChain(mappingChain: Array<IMapping>): IMapping {
    const [requestInput, ...requestChain] = new Array(...mappingChain);

    const responseChain = new Array(...mappingChain);
    const responseInput = responseChain.pop();

    const requestMapping = requestChain.reduce((input, mapping) => {
      return jsonata(this.stringifyedToJsonata(mapping.requestMapping)).evaluate(input);
    }, JSON.parse(requestInput.requestMapping));

    const responseMapping = responseChain.reduceRight((input, mapping) => {
      return jsonata(this.stringifyedToJsonata(mapping.responseMapping)).evaluate(input);
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

  /**
   * Method that takes a stringified JSON object as input and removes the quotes of all string properties.
   *
   * Exmaple:
   * { "foo":"bar" } --> { "foo":bar }
   */
  private stringifyedToJsonata(obj: string) {
    const keyValueRegex = /(?:\"|\')([^"]*)(?:\"|\')(?=:)(?:\:\s*)(?:\"|\')?(true|false|[^"]*)(?:"(?=\s*(,|})))/g;
    return obj.replace(keyValueRegex, '"$1":$2');
  }
}

export enum MappingDirection {
  INPUT, OUTPUT
}
