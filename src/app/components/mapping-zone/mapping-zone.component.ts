import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { NestedTreeControl } from '@angular/cdk/tree';
import { JsonTreeService, JsonTreeNode } from '../../services/jsontree.service';
import { IMappingPair } from '~/app/models/mapping.model';
import { arrayEquals } from '~/app/utils/array-utils';

@Component({
  selector: 'app-mapping-zone',
  templateUrl: './mapping-zone.component.html',
  styleUrls: ['./mapping-zone.component.scss']
})
export class MappingZoneComponent implements OnInit, OnChanges {

  @Input("isRequest") public isRequest: boolean;

  @Input("leftHeading") public leftHeading: string;
  @Input("rightHeading") public rightHeading: string;

  @Input("leftData") public leftData: any;
  @Input("rightData") public rightData: any;

  @Input("mappingPairs") public mappingPairs = new Array<IMappingPair>();

  public leftTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public leftDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  public rightTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public rightDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  public selectedLeft: JsonTreeNode;
  public selectedRight: JsonTreeNode;

  constructor(private jsonTreeService: JsonTreeService) {
  }

  public ngOnInit() {
    if (this.mappingPairs instanceof Array) {
      this.mappingPairs.splice(0);
    } else {
      this.mappingPairs = new Array<IMappingPair>();
    }

    this.leftDataSource.data = this.jsonTreeService.toTree(this.leftData);
    this.leftTreeControl.dataNodes = this.leftDataSource.data;
    if(this.leftDataSource.data.length !== 0) this.leftTreeControl.expandAll();

    this.rightDataSource.data = this.jsonTreeService.toTree(this.rightData);
    this.rightTreeControl.dataNodes = this.rightDataSource.data;
    if(this.rightDataSource.data.length !== 0) this.rightTreeControl.expandAll();

  }

  public ngOnChanges(changes: SimpleChanges) {
    this.ngOnInit();
  }

  public mapSelected() {
    this.mappingPairs.push({
      source: this.selectedLeft.keyChain,
      target: this.selectedRight.keyChain
    });
    this.selectedLeft = this.selectedRight = undefined;
  }

  public removePair(pair: IMappingPair) {
    const idx = this.mappingPairs.indexOf(pair);
    if (idx >= 0) this.mappingPairs.splice(idx, 1);
  }

  public isMapped(node: JsonTreeNode, source: boolean) {
    return this.mappingPairs.some(e => (source && arrayEquals(e.source, node.keyChain)) || (!source && arrayEquals(e.target, node.keyChain)));
  }

  public hasChild = (_: number, node: JsonTreeNode) => !!node.children && node.children.length > 0;
}
