interface Marriage {
  location: string;
  date: string;
  person1: Person;
  person2: Person;
  children: string;
  whereMet: string;
  imageUrl: string;
  url: string;
}

interface Person {
  name: string;
  age: string;
  location: string;
  job: string;
}

export {Marriage, Person}