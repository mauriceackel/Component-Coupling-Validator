import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TransformationComponent } from './transformation.component';
import { MappingZoneModule } from '~/app/components/mapping-zone/mapping-zone.module';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { JoinPipeModule } from '~/app/utils/join.pipe';

@NgModule({
  declarations: [
    TransformationComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MappingZoneModule,
    MatTabsModule,
    MatSelectModule,
    JoinPipeModule,
  ],
  exports: [
    TransformationComponent
  ]
})
export class TransformationModule { }
