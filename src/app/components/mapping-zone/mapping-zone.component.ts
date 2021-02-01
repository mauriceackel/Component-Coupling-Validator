import { NestedTreeControl } from '@angular/cdk/tree';
import { Component, Input, OnChanges, OnInit, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { IMappingPair, MappingPairType } from '~/app/models/mapping.model';
import { arrayEquals } from '~/app/utils/array-utils';
import { JsonTreeNode, JsonTreeService } from '../../services/jsontree.service';
import { TransformationDialog } from '../transformation-dialog/transformation-dialog.component';
import { MappingService, buildJSONataKey } from '~/app/services/mapping.service';

@Component({
  selector: 'app-mapping-zone',
  templateUrl: './mapping-zone.component.html',
  styleUrls: ['./mapping-zone.component.scss']
})
export class MappingZoneComponent implements OnInit, OnChanges {

  @Input("strict") public strict: boolean;

  @Input("isRequest") public isRequest: boolean;

  @Input("leftHeading") public leftHeading: string;
  @Input("rightHeading") public rightHeading: string;

  @Input("leftData") public leftData: any;
  @Input("rightData") public rightData: any;

  @Input("mappingPairs") public mappingPairs = new Array<IMappingPair>();
  @Output("mapSame") public mapSame = new EventEmitter();

  @Output("mappingAdded") public mappingAdded = new EventEmitter();

  public leftTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public leftDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  public rightTreeControl = new NestedTreeControl<JsonTreeNode>(node => node.children);
  public rightDataSource = new MatTreeNestedDataSource<JsonTreeNode>();

  public selectedLeft = new Array<JsonTreeNode>();
  public selectedRight = new Array<JsonTreeNode>();

  constructor(
    private jsonTreeService: JsonTreeService,
    private dialog: MatDialog
  ) { }

  public ngOnInit() {
    // if (this.mappingPairs instanceof Array) {
    //   this.mappingPairs.splice(0);
    // } else {
    //   this.mappingPairs = new Array<IMappingPair>();
    // }

    this.leftDataSource.data = this.jsonTreeService.toTree(this.leftData);
    this.leftTreeControl.dataNodes = this.leftDataSource.data;
    if (this.leftDataSource.data.length !== 0) this.leftTreeControl.expandAll();

    this.rightDataSource.data = this.jsonTreeService.toTree(this.rightData);
    this.rightTreeControl.dataNodes = this.rightDataSource.data;
    if (this.rightDataSource.data.length !== 0) this.rightTreeControl.expandAll();

  }

  public ngOnChanges(changes: SimpleChanges) {
    this.ngOnInit();
  }

  public mapSelected() {
    let mappingPair: IMappingPair;
    if (this.isRequest) {
      mappingPair = {
        creationType: MappingPairType.MANUAL,
        provided: this.selectedLeft.map(n => n.keyChain),
        required: this.selectedRight[0].keyChain,
        mappingCode: this.selectedLeft.length === 1 ? buildJSONataKey(this.selectedLeft[0].keyChain) : "",
      }
    } else {
      mappingPair = {
        creationType: MappingPairType.MANUAL,
        provided: this.selectedRight.map(n => n.keyChain),
        required: this.selectedLeft[0].keyChain,
        mappingCode: this.selectedRight.length === 1 ? buildJSONataKey(this.selectedRight[0].keyChain) : "",
      }
    }

    this.mappingPairs.push(mappingPair);
    this.mappingAdded.emit(mappingPair);

    this.selectedLeft = new Array<JsonTreeNode>();
    this.selectedRight = new Array<JsonTreeNode>();
  }

  public openEditor(mappingPair: IMappingPair) {
    const dialogRef: MatDialogRef<TransformationDialog, string> = this.dialog.open(TransformationDialog, {
      position: {
        top: "5%",
        bottom: "5%",
      },
      width: "80%",
      data: {
        strict: this.strict,
        mappingCode: mappingPair.mappingCode,
        keys: mappingPair.provided
      }
    });

    dialogRef.afterClosed().subscribe((mappingCode) => {
      if (mappingCode !== undefined) {
        mappingPair.mappingCode = mappingCode;
      }
    });
  }

  public selectLeft(node: JsonTreeNode) {
    const index = this.selectedLeft.indexOf(node);
    if (index >= 0) {
      this.selectedLeft.splice(index, 1);
    } else if (this.isRequest || this.selectedLeft.length < 1) {
      this.selectedLeft.push(node);
    }
  }

  public selectRight(node: JsonTreeNode) {
    const index = this.selectedRight.indexOf(node);
    if (index >= 0) {
      this.selectedRight.splice(index, 1);
    } else if (!this.isRequest || this.selectedRight.length < 1) {
      this.selectedRight.push(node);
    }
  }

  public removePair(pair: IMappingPair) {
    const idx = this.mappingPairs.indexOf(pair);
    if (idx >= 0) this.mappingPairs.splice(idx, 1);
  }

  public isMapped(node: JsonTreeNode) {
    return this.mappingPairs.some(p => arrayEquals(p.required, node.keyChain));
  }

  public hasChild = (_: number, node: JsonTreeNode) => !!node.children && node.children.length > 0;
}
