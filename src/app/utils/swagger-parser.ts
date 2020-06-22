import * as deepcopy from 'deepcopy';
import { OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import * as SwaggerParser from 'swagger-parser';
import { IApi } from '../models/api.model';
import { IInterface } from '../models/interface.model';

export async function getServer(api: IApi) {
  let apiObject = await SwaggerParser.validate(deepcopy(api.openApiSpec), { validate: { spec: false } });

  switch (true) {
    case !!api.openApiSpec.swagger && api.openApiSpec.swagger.startsWith('2'): {
      const apiV2 = apiObject as OpenAPIV2.Document;
      return `${apiV2.host}${apiV2.basePath || ''}`;
    };
    case !!api.openApiSpec.openapi && api.openApiSpec.openapi.startsWith('3'): {
      const apiV3 = apiObject as OpenAPIV3.Document;
      const server = apiV3.servers[0];
      const url = Object.entries(server.variables || []).reduce((url, [varname, value]) => url.replace(new RegExp(`{${varname}}`, 'g'), value.default), server.url);
      return url;
    };
  }
}

export async function getRequestUrl(iface: IInterface) {
  const server = await getServer(iface.api);
  const { url, method } = await getOperation(iface.api, iface.operationId);
  return { method, url: `${server}${url}` }
}

export async function getOperationTemplates(api: IApi) {
  let operationTemplates: IOperationTemplate[] = [];

  let apiObject = await SwaggerParser.validate(deepcopy(api.openApiSpec), { validate: { spec: false } }) as OpenAPIV3.Document;

  for (const url in apiObject.paths) {
    let path = apiObject.paths[url];
    for (const op in path) {
      let property = op as keyof OpenAPIV3.PathItemObject;
      if (["get", "post", "delete", "put", "patch", "trace", "head", "options"].includes(property)) {
        let operation = path[property] as OpenAPIV3.OperationObject;

        let operationTemplate = { operationId: operation.operationId, responseIds: new Array<string>() };
        for (const response in operation.responses) {
          operationTemplate.responseIds.push(response);
        }

        operationTemplates.push(operationTemplate);
      }
    }
  }

  return operationTemplates;
}

export function getResponses(operationTemplates: IOperationTemplate[], operationId: string | undefined) {
  return operationTemplates?.find(t => t.operationId == operationId)?.responseIds;
}

export async function getOperation(api: IApi, operationId: string) {
  let apiObject = await SwaggerParser.validate(deepcopy(api.openApiSpec), { validate: { spec: false } }) as OpenAPIV3.Document;

  //Iterate all pathes
  for (const url in apiObject.paths) {
    let path = apiObject.paths[url];

    //Iterate all operations in a path
    for (const op in path) {
      let property = op as keyof OpenAPIV3.PathItemObject;
      if (["get", "post", "delete", "put", "patch", "trace", "head", "options"].includes(property)) {
        let operation = path[property] as OpenAPIV3.OperationObject;

        //Filter for an operation that matches the searchOperation id
        if (operation.operationId == operationId) {
          return { method: property, url };
        }
      }
    }
  }

  return undefined;
}

export async function getResponseSchema(api: IApi, searchOperation: IOperation) {
  let apiObject = await SwaggerParser.validate(deepcopy(api.openApiSpec), { validate: { spec: false } }) as OpenAPIV3.Document | OpenAPIV2.Document;

  //Iterate all pathes
  for (const url in apiObject.paths) {
    let path = apiObject.paths[url] as OpenAPIV3.PathItemObject | OpenAPIV2.PathItemObject;

    //Iterate all operations in a path
    for (const op in path) {
      const property = op as keyof OpenAPIV3.PathItemObject | keyof OpenAPIV2.PathItemObject;
      if (["get", "post", "delete", "put", "patch", "trace", "head", "options"].includes(property)) {
        const operation = path[property] as OpenAPIV3.OperationObject | OpenAPIV2.OperationObject;

        //Filter for an operation that matches the searchOperation id
        if (operation.operationId == searchOperation.operationId) {

          //Iterate all responses in the matching operation
          for (const res in operation.responses) {

            //Filter for response which matches the searched response id
            if (res == searchOperation.responseId) {
              const response = operation.responses[res] as OpenAPIV3.ResponseObject | OpenAPIV2.ResponseObject;

              const v2Content = (response as OpenAPIV2.ResponseObject).schema;
              const v3Content = (response as OpenAPIV3.ResponseObject).content && (response as OpenAPIV3.ResponseObject).content["application/json"]["schema"];

              const jsonResponse = v2Content || v3Content || {};
              return removeTypes(flattenSchema(jsonResponse));
            }
          }
        }
      }
    }
  }

  return undefined;
}

export async function getRequestSchema(api: IApi, searchOperation: IOperation, ignoreOptional: boolean = false) {
  let apiObject = await SwaggerParser.validate(deepcopy(api.openApiSpec), { validate: { spec: false } }) as OpenAPIV3.Document | OpenAPIV2.Document;

  const result = { schema: {} } as any;

  //Iterate all pathes
  for (const url in apiObject.paths) {
    const path = apiObject.paths[url];

    //Iterate all operations in a path
    for (const op in path) {
      const property = op as keyof OpenAPIV3.PathItemObject | keyof OpenAPIV2.PathItemObject;
      if (["get", "post", "delete", "put", "patch", "trace", "head", "options"].includes(property)) {
        const operation = path[property] as OpenAPIV3.OperationObject | OpenAPIV2.OperationObject;

        //Filter for an operation that matches the searchOperation id
        if (operation.operationId == searchOperation.operationId) {

          //Get all required parameters
          const parameters = ([...path.parameters || [], ...operation.parameters || []] as (OpenAPIV3.ParameterObject | OpenAPIV2.InBodyParameterObject | OpenAPIV2.GeneralParameterObject)[])
            .filter(p => p.in !== "body" && (!ignoreOptional || p.in === "path" || p.required))
            .reduce((prev, curr) => {
              prev[curr.name] = { 'x-optional': !curr.required, ...curr.schema };
              return prev;
            }, {});
          if (Object.keys(parameters).length !== 0) {
            result.schema.parameters = removeTypes(flattenSchema({ type: "object", properties: parameters }));
          }

          //Iterate all responses in the matching operation
          for (const res in operation.responses) {

            //Filter for response which matches the searched response id
            if (res == searchOperation.responseId) {

              const params = operation.parameters as OpenAPIV2.InBodyParameterObject[];
              const v2Content = params && { type: "object", properties: params.filter(p => p.in === "body").reduce((obj, e) => { obj[e.name] = e.schema; return obj }, {}) };

              const body = operation.requestBody as OpenAPIV3.RequestBodyObject;
              const v3Content = body && (body as OpenAPIV3.RequestBodyObject).content && (body as OpenAPIV3.RequestBodyObject).content["application/json"]["schema"];

              const jsonBody = v2Content || v3Content;
              if (jsonBody) {
                result.schema.body = removeTypes(flattenSchema(jsonBody));
              }
              return result;
            }
          }
        }
      }
    }
  }

  return undefined;
}

function removeTypes(schema: any) {
  if (schema["type"] == "object") {
    for (const key in schema.properties) {
      schema.properties[key] = removeTypes(schema.properties[key])
    }
    return { 'x-optional': schema['x-optional'], schema: schema.properties || {} };
  } else if (schema["type"] == "array") {
    return { 'x-optional': schema['x-optional'], schema: [removeTypes(schema.items)] };
  } else {
    return { 'x-optional': schema["x-optional"], schema: schema["type"] };
  }
}

function flattenSchema(schema: any) {
  if (schema["allOf"] != undefined) {
    let combination: any = {
      type: "object",
      properties: {}
    }
    for (const child of schema["allOf"]) {
      combination.properties = {
        ...combination.properties,
        ...flattenSchema(child).properties
      }
    }
    return combination;
  } else {
    return schema;
  }
}

export interface IOperationTemplate {
  operationId: string,
  responseIds: Array<string>
}

export interface IOperation {
  operationId: string,
  responseId: string | undefined
}
