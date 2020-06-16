export interface IInterface {
  id: string
  createdBy: string
  endpoint: string
  method: "DELETE" | "GET" | "HEAD" | "JSONP" | "OPTIONS"
  name: string
  request: {
    body: any
  }
  response: {
    body: any
  }
}

// const example: IInterface = {
//   id: { $oid: "5e875c45bfeef32e21a567c7" },
//   endpoint: "GET host.example.com/posts",
//   response: {
//     body: "{\"name\":\"string\",\"address\":{\"street\":\"string\",\"city\":\"string\",\"houseNumber\":\"number\"}}",
//     jsonLd: "{\"@context\":{\"name\":\"http://schema.org/name\",\"address\":{\"@id\":\"http://schema.org/PostalAddress\",\"@context\":{\"street\":\"http://schema.org/streetAddress\",\"city\":\"http://schema.org/locality\",\"houseNumber\":\"http://schema.org/streetAddress\"}}},\"name\":\"string\",\"address\":{\"street\":\"string\",\"city\":\"string\",\"houseNumber\":\"number\"}}"
//   },
//   request: {
//     body: "{\"filter\":{\"city\":\"string\"}}",
//     jsonLd: "{\"@context\":{\"filter\":\"http://schema.org/filter\",\"city\":\"http://schema.org/city\"},\"filter\":{\"city\":\"string\"}}"
//   }
// }

