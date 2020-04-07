import { Component } from '@angular/core';
import { IdentificationService } from './services/identification.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  constructor(public identificationService: IdentificationService) { }

}
