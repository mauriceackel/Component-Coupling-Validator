import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { IOpenApi } from '../models/openapi.model';
import { removeUndefined } from '../utils/remove-undefined';
import { IAsyncApi } from '../models/asyncapi.model';
import { AttributeNode, MappingEdge } from '../models/knowledgegraph.model';
import { map } from 'rxjs/operators';
import * as firebase from 'firebase';
import { IMappingPair } from '../models/mapping.model';
import * as jsonata from 'jsonata';
import { join } from 'path';

const REVERSE = {
  '+': '-',
  '-': '+',
  '*': '/',
  '/': '*',
}

@Injectable({
  providedIn: 'root'
})
export class AttributeMappingService {

  private readonly attributeNodes = this.firestore.collection<AttributeNode>('attributeNodes');

  constructor(private firestore: AngularFirestore) { }

  validateMapping(mappingPair: IMappingPair): boolean {
    if (mappingPair.provided.length !== 1) {
      return false;
    }
    return this.isSimple(jsonata(mappingPair.mappingCode).ast())[0];
  }

  async addMapping(sourceId: string, targetId: string, transformation: string): Promise<void> {
    const [sourceNode, targetNode] = await Promise.all([
      this.getNode(sourceId, true),
      this.getNode(targetId, true)
    ]);

    // Add edges
    const forwardEdge: MappingEdge = {
      source: sourceId,
      target: targetId,
      transformation: transformation
    };
    const backwardEdge = this.revertEdge(forwardEdge);
    await Promise.all([
      this.addEdge(sourceId, forwardEdge),
      this.addEdge(targetId, backwardEdge)
    ]);

    if (sourceNode.component.includes(targetId)) {
      console.log("Already exists");
      return;
    }

    // Update components
    await this.unionComponents(sourceNode.component, targetNode.component);
  }

  async getComponent(attributeId: string): Promise<string[] | undefined> {
    const node = await this.getNode(attributeId, false);
    return node?.component;
  }

  async getComponentLocal(attributeId: string, mappingPairs: IMappingPair[]): Promise<string[] | undefined> {
    const localKb = this.getLocalKB(mappingPairs);

    const localComponent = localKb.get(attributeId)?.component || [];
    const dbComponent = await this.getNode(attributeId, false).then(n => n?.component || []);
    const extendedComponents = await Promise.all(localComponent.map(nodeId => this.getComponent(nodeId).then(c => c || [])));

    const joinedComponent = new Set<string>();
    [...localComponent, ...dbComponent].forEach(node => joinedComponent.add(node));
    extendedComponents.forEach(comp => comp.forEach(node => joinedComponent.add(node)));
    return [...joinedComponent.values()];
  }

  async getMapping(sourceId: string, targetId: string): Promise<string> {
    const path = await this.shortestPath(sourceId, targetId);

    return this.joinTransformations(path);
  }

  async getMappingLocal(sourceId: string, targetId: string, mappingPairs: IMappingPair[]): Promise<string> {
    const localKB = this.getLocalKB(mappingPairs);

    const path = await this.shortestPathLocal(sourceId, targetId, localKB);

    return this.joinTransformations(path);
  }

  //Returns [simple, hasPath]
  private isSimple(ast: any): [boolean, boolean] {
    switch (ast.type) {
      case 'number': return [true, false];
      case 'path': return [true, true];
      case 'block': {
        if (ast.expressions.length > 1) {
          return [false, false];
        }
        return this.isSimple(ast.expressions[0]);
      };
      case 'unary': {
        if (ast.value === '-') {
          return this.isSimple(ast.expression);
        }
        return [false, false];
      };
      case 'binary': {
        if (!['*', '/', '+', '-'].includes(ast.value)) {
          return [false, false];
        }
        const [simpleLeft, pathLeft] = this.isSimple(ast.lhs);
        const [simpleRight, pathRight] = this.isSimple(ast.rhs);
        return [simpleLeft && simpleRight && !(pathLeft && pathRight), pathLeft || pathRight];
      };
      default: return [false, false];
    }

  }

  private getLocalKB(mappingPairs: IMappingPair[]) {
    const localKb = new Map<string, AttributeNode>();

    for (const mappingPair of mappingPairs) {
      if (!this.validateMapping(mappingPair)) {
        continue;
      }

      const sourceId = mappingPair.provided[0].join('.');
      const targetId = mappingPair.required.join('.');

      if (!localKb.has(sourceId)) {
        localKb.set(sourceId, { id: sourceId, component: [sourceId], edges: [] })
      }
      const sourceNode = localKb.get(sourceId);
      if (!localKb.has(targetId)) {
        localKb.set(targetId, { id: targetId, component: [targetId], edges: [] })
      }
      const targetNode = localKb.get(targetId);

      const edge = { source: sourceId, target: targetId, transformation: mappingPair.mappingCode };
      sourceNode.edges.push(edge);
      targetNode.edges.push(this.revertEdge(edge));

      if (sourceNode.component.includes(targetNode.id!)) {
        console.log("Already exists");
        return;
      }

      if (sourceNode.component.length > targetNode.component.length) {
        sourceNode.component.push(...targetNode.component);
        targetNode.component.forEach(nodeId => localKb.get(nodeId).component = sourceNode.component);
      } else {
        targetNode.component.push(...sourceNode.component);
        sourceNode.component.forEach(nodeId => localKb.get(nodeId).component = targetNode.component);
      }
    }

    return localKb;
  }

  private revertTransformation(attributeId: string, transformation: string): string {
    let ast = jsonata(transformation).ast() as any;
    let newAst: any = { type: 'path', steps: attributeId.split('.') };

    while (ast !== undefined) {
      switch (ast.type) {
        case 'binary': {
          const leftHasPath = this.isSimple(ast.lhs)[1];
          if (leftHasPath) {
            newAst = { type: 'binary', value: REVERSE[ast.value], lhs: newAst, rhs: ast.rhs };
            ast = ast.lhs;
          } else {
            newAst = { type: 'binary', value: REVERSE[ast.value], lhs: newAst, rhs: ast.lhs };
            ast = ast.rhs;
          }
        }; break;
        case 'unary': {
          newAst = { type: 'unary', value: REVERSE[ast.value], expression: newAst };
          ast = ast.expression;
        }; break;
        case 'block': {
          ast = ast.expressions[0];
        }; break;
        case 'path': {
          ast = undefined;
        }
      }
    }

    return this.stringifyAst(newAst);
  }

  private stringifyAst(ast: any): string {
    switch (ast.type) {
      case 'binary': return `(${this.stringifyAst(ast.lhs)} ${ast.value} ${this.stringifyAst(ast.rhs)})`;
      case 'unary': {
        if (ast.value === '+') {
          return this.stringifyAst(ast.expression);
        }
        return `${ast.value}(${this.stringifyAst(ast.expression)})`
      };
      case 'path': return `${ast.steps.join('.')}`;
      case 'number': return ast.value;
      case 'block': return `(${this.stringifyAst(ast.expressions[0])})`;
      default: return '';
    }
  }

  private joinTransformations(edges: MappingEdge[]): string {
    const [initialEdge, ...otherEdges] = edges;
    const joined = otherEdges.reduce((trans, e) => e.transformation.replace(new RegExp(`${e.source}`, 'g'), `(${trans})`), initialEdge.transformation);
    return joined;
  }

  private async shortestPath(sourceId: string, targetId: string): Promise<MappingEdge[]> {
    if (sourceId === targetId) return [];

    const initialEdge: MappingEdge = { source: 'dummy', target: sourceId, transformation: '' };
    const paths = [[initialEdge]];
    const visited = [];

    while (paths.length > 0) {
      const path = paths.shift()!;
      const lastEdge = path[path.length - 1];

      visited.push(lastEdge.target);

      const edges = (await this.getNode(lastEdge.target, false)).edges;
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];

        if (edge.target === targetId) return [...path.slice(1), edge];

        if (visited.includes(edge.target)) continue;

        paths.push([...path, edge]);
      }
    }

    return [];
  }

  private async shortestPathLocal(sourceId: string, targetId: string, localKB: Map<string, AttributeNode>): Promise<MappingEdge[]> {
    if (sourceId === targetId) return [];

    const initialEdge: MappingEdge = { source: 'dummy', target: sourceId, transformation: '' };
    const paths = [[initialEdge]];
    const visited = [];

    while (paths.length > 0) {
      const path = paths.shift()!;
      const lastEdge = path[path.length - 1];

      visited.push(lastEdge.target);

      const localNodeEdges = localKB.get(lastEdge.target)?.edges || [];
      const dbNodeEdges = (await this.getNode(lastEdge.target, false))?.edges || [];
      const edges = [...localNodeEdges, ...dbNodeEdges];
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];

        if (edge.target === targetId) return [...path.slice(1), edge];

        if (visited.includes(edge.target)) continue;

        paths.push([...path, edge]);
      }
    }

    return [];
  }

  private revertEdge(edge: MappingEdge): MappingEdge {
    return {
      source: edge.target,
      target: edge.source,
      transformation: this.revertTransformation(edge.target, edge.transformation)
    };
  }

  private async getNode(attributeId: string, upsert: boolean): Promise<AttributeNode | undefined> {
    const raw = await this.attributeNodes.doc(attributeId).get().toPromise();

    if (!raw.exists && !upsert) {
      return undefined;
    }

    if (!raw.exists) {
      const data = {
        component: [attributeId],
        edges: []
      };

      await this.attributeNodes.doc(attributeId).set(data);
      return { id: attributeId, ...data } as AttributeNode;
    }

    return this.parseNode(raw.id, raw.data())
  }

  private addEdge(attributeId: string, edge: MappingEdge) {
    return this.attributeNodes.doc(attributeId).update({ edges: firebase.firestore.FieldValue.arrayUnion(edge) })
  }

  private unionComponents(sourceComponent: string[], targetComponent: string[]) {
    const sourcePromise = Promise.all(sourceComponent.map(nodeId => this.attributeNodes.doc(nodeId).update({
      component: firebase.firestore.FieldValue.arrayUnion(...targetComponent)
    })));
    const targetPromise = Promise.all(targetComponent.map(nodeId => this.attributeNodes.doc(nodeId).update({
      component: firebase.firestore.FieldValue.arrayUnion(...sourceComponent)
    })));
    return Promise.all([sourcePromise, targetPromise]);
  }

  private parseNode(id: string, node: any): AttributeNode {
    return {
      edges: [],
      component: [],
      ...node,
      id,
    }
  }

  private serializeNode(node: AttributeNode) {
    let result = {
      ...node,
      id: undefined,
    }
    result = removeUndefined(result);
    return result;
  }

}
