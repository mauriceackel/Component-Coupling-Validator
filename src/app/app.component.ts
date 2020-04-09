import { Component } from '@angular/core';
import { AuthenticationService } from './services/authentication.service';
import { TaskService } from './services/task.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  constructor(public identificationService: AuthenticationService, public taskService: TaskService) { }

}
