import { Pipe, PipeTransform, NgModule } from "@angular/core";

@Pipe({
  name: "join"
})
export class JoinPipe implements PipeTransform {

  transform(array: Array<any>, sep = ', '): string {
    if (array instanceof Array) {
      return array.join(sep)
    }
  }

}

@NgModule({
  declarations: [
    JoinPipe
  ],
  exports: [
    JoinPipe
  ]
})
export class JoinPipeModule { }
