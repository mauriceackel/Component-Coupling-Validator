import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { EditorZoneModule } from '~/app/components/editor-zone/editor-zone.module';
import { MappingZoneModule } from '~/app/components/mapping-zone/mapping-zone.module';
import { GenericDialogModule } from '~/app/utils/generic-dialog/generic-dialog.module';
import { JoinPipeModule } from '~/app/utils/pipes/join.pipe';
import { DescribeComponent } from './describe.component';

@NgModule({
  declarations: [
    DescribeComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    GenericDialogModule,
    MatInputModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MappingZoneModule,
    MatSelectModule,
    MatTabsModule,
    MatExpansionModule,
    MatExpansionModule,
    EditorZoneModule,
    MatTreeModule,
    JoinPipeModule,
  ],
  exports: [
    DescribeComponent
  ]
})
export class DescribeModule { }
