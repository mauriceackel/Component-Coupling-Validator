import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MappingZoneModule } from '~/app/components/mapping-zone/mapping-zone.module';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { EditorZoneModule } from '~/app/components/editor-zone/editor-zone.module';
import { JoinPipeModule } from '~/app/utils/pipes/join.pipe';
import { DescribeComponent } from './describe.component';
import { MatTreeModule } from '@angular/material/tree';

@NgModule({
  declarations: [
    DescribeComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
