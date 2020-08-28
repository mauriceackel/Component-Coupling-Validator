import { Component } from '@angular/core';
import { AuthenticationService } from './services/authentication.service';
import { TaskService } from './services/task.service';
import { ApiService } from './services/api.service';
import { getMessageSchema } from './utils/asyncapi-parser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  constructor() { }

}
