import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ManualComponent } from './manual.component';
import { MappingZoneModule } from '~/app/components/mapping-zone/mapping-zone.module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { JoinPipeModule } from '~/app/utils/pipes/join.pipe';
import { GenericDialogModule } from '~/app/utils/generic-dialog/generic-dialog.module';

@NgModule({
  declarations: [
    ManualComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MappingZoneModule,
    MatCardModule,
    JoinPipeModule,
    GenericDialogModule,
  ],
  exports: [
    ManualComponent
  ]
})
export class ManualModule { }
