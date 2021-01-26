import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { KeyChain } from '~/app/services/jsontree.service';
import { buildJSONataKey } from '~/app/services/mapping.service';

@Component({
  templateUrl: './transformation-dialog.component.html'
})
export class TransformationDialog implements OnInit {
  public mappingCode: string;
  public keys: string[];
  public strict: boolean;

  @ViewChild('mappingCodeArea') mappingCodeArea: ElementRef<HTMLTextAreaElement>

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { mappingCode: string, keys: KeyChain[], strict?: boolean },
    private dialogRef: MatDialogRef<TransformationDialog>
  ) {
    this.mappingCode = data.mappingCode;
    this.strict = !!data.strict;
    this.keys = data.keys.map(kC => buildJSONataKey(kC))
  }

  public insertKey(key: string) {
    this.mappingCodeArea.nativeElement.focus();
    document.execCommand("insertText", false, key);
  }

  async ngOnInit() {

  }

}
