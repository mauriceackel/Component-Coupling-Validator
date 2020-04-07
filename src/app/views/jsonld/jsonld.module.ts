import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { JsonldComponent } from './jsonld.component';
import { MappingZoneModule } from '~/app/components/mapping-zone/mapping-zone.module';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { EditorZoneModule } from '~/app/components/editor-zone/editor-zone.module';
import { JoinPipeModule } from '~/app/utils/join.pipe';

@NgModule({
  declarations: [
    JsonldComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MappingZoneModule,
    MatSelectModule,
    MatTabsModule,
    MatExpansionModule,
    EditorZoneModule,
    JoinPipeModule,
  ],
  exports: [
    JsonldComponent
  ]
})
export class JsonldModule { }
