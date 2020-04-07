import { Component, OnInit, Input, Output, EventEmitter, OnChanges } from '@angular/core';

@Component({
  selector: 'app-editor-zone',
  templateUrl: './editor-zone.component.html',
})
export class EditorZoneComponent implements OnInit, OnChanges {

  @Input("leftHeading") public leftHeading: string;
  @Input("rightHeading") public rightHeading: string;

  @Input("leftData") public leftData: any;
  @Input("rightData") public rightData: any;

  @Output("saveLeft") public saveLeft = new EventEmitter<any>();
  @Output("saveRight") public saveRight = new EventEmitter<any>();

  public uncommittedLeftData: any;
  public uncommittedRightData: any;

  constructor() { }

  public ngOnInit() {
    this.uncommittedLeftData = this.leftData;
    this.uncommittedRightData = this.rightData;
  }

  public ngOnChanges() {
    this.ngOnInit();
  }

}
