import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MappingZoneComponent } from './mapping-zone.component';
import { JoinPipeModule } from '~/app/utils/pipes/join.pipe';

@NgModule({
  declarations: [
    MappingZoneComponent
  ],
  imports: [
    CommonModule,
    MatTreeModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    JoinPipeModule,
  ],
  exports: [
    MappingZoneComponent
  ]
})
export class MappingZoneModule { }
