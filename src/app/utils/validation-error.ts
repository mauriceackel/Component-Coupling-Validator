import { KeyChain } from '../services/jsontree.service';

export class ValidationError extends Error {

  public missingRequestProperties: Array<KeyChain>;
  public missingResponseProperties: Array<KeyChain>;

  constructor(message?: string, missingRequestProperties: Array<KeyChain> = [], missingResponseProperties: Array<KeyChain> = []) {
      super(message);
      this.missingRequestProperties = missingRequestProperties;
      this.missingResponseProperties = missingResponseProperties;
      // Set the prototype explicitly.
      Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
