import { Component, Input, Output, EventEmitter, ViewChild, OnChanges, SimpleChanges, ElementRef, AfterViewInit } from '@angular/core';
import * as JSONEditor from 'jsoneditor';

@Component({
  selector: 'app-json-editor',
  templateUrl: './json-editor.component.html',
})
export class JsonEditorComponent implements AfterViewInit, OnChanges {

  public uuid : string;

  @Input("data") public data: any;
  @Output("jsonChange") public jsonChange = new EventEmitter<any>();

  @ViewChild('jsonEditor', { static: true }) jsonEditorRef: ElementRef;
  private jsonEditor: JSONEditor;
  private editorOptions: any;

  public valid: boolean = false;
  public hasChanges: boolean = false;

  constructor() {
    this.uuid = Math.floor(Math.random() * 100000000000) + "";
    this.editorOptions = {
      mode: 'code',
      enableSort: false,
      enableTransform: false,
      onChange: () => this.handleChange()
    }
  }

  public ngAfterViewInit() {
    this.jsonEditor = new JSONEditor(this.jsonEditorRef.nativeElement, this.editorOptions);
  }

  public ngOnChanges(changes: SimpleChanges) {
    if(changes.data?.currentValue === undefined) {
      this.jsonEditor.set({});
    } else if (JSON.stringify(changes.data.currentValue) !== JSON.stringify(this.jsonEditor.get())) {
      this.jsonEditor.set(changes.data.currentValue);
    }
    this.hasChanges = false;
  }

  private isValidJson() {
    try {
      JSON.parse(this.jsonEditor.getText());
      return true;
    } catch (e) {
      return false;
    }
  }

  private handleChange() {
    if (this.isValidJson()) {
      const data = this.jsonEditor.get();

      this.valid = true;
      this.hasChanges = JSON.stringify(data) !== JSON.stringify(this.data);

      this.jsonChange.emit(data);
    } else {
      this.hasChanges = true;
      this.valid = false;
    }
  }

}
