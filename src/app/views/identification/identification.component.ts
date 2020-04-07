import { Component, OnInit } from '@angular/core';
import { IdentificationService } from '../../services/identification.service';
import { Router, ActivatedRoute } from '@angular/router';
import { FormGroup, FormControl, Validators } from '@angular/forms';

@Component({
  selector: 'app-identification',
  templateUrl: './identification.component.html',
  styleUrls: ['./identification.component.scss']
})
export class IdentificationComponent implements OnInit {

  private returnUrl: string = '/';
  public identificationForm = new FormGroup({
    username: new FormControl(undefined, Validators.required),
  });

  constructor(private identificationService: IdentificationService, private router: Router, private route: ActivatedRoute) { }

  public ngOnInit() {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
  }

  public identify() {
    this.identificationService.UserName = this.identificationForm.get("username").value;
    this.router.navigateByUrl(this.returnUrl);
  }

}
