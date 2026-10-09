import type {RomanPoliticalBloc} from "./roman-republic.js";

export interface DefaultRomanFamilySeed{
  name:string;
  seats:number;
  influence:number;
  bloc:RomanPoliticalBloc;
}

export interface DefaultRomanFamilyMemberSeed{
  familyName:string;
  key:string;
  name:string;
  gender:"MALE"|"FEMALE";
  age:number;
  position:"HEAD"|"SPOUSE"|"CHILD"|"HEAD_SIBLING"|"SPOUSE_SIBLING";
  relation:string;
  spouseKey?:string;
  motherKey?:string;
  fatherKey?:string;
  sortOrder:number;
}

export const DEFAULT_ROMAN_FAMILIES:DefaultRomanFamilySeed[]=[
  {name:"Scipio ailesi",seats:18,influence:0,bloc:"MILITARISTS"},
  {name:"Magnus ailesi",seats:18,influence:0,bloc:"OPTIMATES"},
  {name:"Cato ailesi",seats:12,influence:0,bloc:"TRADITIONALISTS"},
  {name:"Nero ailesi",seats:12,influence:0,bloc:"POPULARES"},
  {name:"Julius ailesi",seats:5,influence:8,bloc:"POPULARES"},
  {name:"Aemilius ailesi",seats:5,influence:8,bloc:"OPTIMATES"},
  {name:"Fabius ailesi",seats:5,influence:8,bloc:"TRADITIONALISTS"},
  {name:"Valerius ailesi",seats:5,influence:8,bloc:"EQUITES"},
  {name:"Licinius ailesi",seats:5,influence:8,bloc:"EQUITES"},
  {name:"Junius ailesi",seats:5,influence:8,bloc:"POPULARES"},
  {name:"Servilius ailesi",seats:5,influence:8,bloc:"MILITARISTS"},
  {name:"Caecilius ailesi",seats:5,influence:8,bloc:"OPTIMATES"}
];

export const DEFAULT_ROMAN_NPC_MEMBERS:DefaultRomanFamilyMemberSeed[]=[
  {familyName:"Julius ailesi",key:"head",name:"Gaius Julius Varro",gender:"MALE",age:48,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Julius ailesi",key:"spouse",name:"Aurelia Cotta",gender:"FEMALE",age:42,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Julius ailesi",key:"child_one",name:"Lucius Julius Varro",gender:"MALE",age:20,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Julius ailesi",key:"child_two",name:"Julia Varra",gender:"FEMALE",age:17,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Julius ailesi",key:"head_sibling",name:"Sextus Julius Varro",gender:"MALE",age:44,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Julius ailesi",key:"spouse_sibling",name:"Marcus Aurelius Cotta",gender:"MALE",age:39,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Aemilius ailesi",key:"head",name:"Marcus Aemilius Lepidus",gender:"MALE",age:50,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Aemilius ailesi",key:"spouse",name:"Cornelia Lentula",gender:"FEMALE",age:43,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Aemilius ailesi",key:"child_one",name:"Lucius Aemilius Lepidus",gender:"MALE",age:22,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Aemilius ailesi",key:"child_two",name:"Aemilia Lepida",gender:"FEMALE",age:18,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Aemilius ailesi",key:"head_sibling",name:"Quintus Aemilius Lepidus",gender:"MALE",age:46,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Aemilius ailesi",key:"spouse_sibling",name:"Tertia Cornelia Lentula",gender:"FEMALE",age:38,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Fabius ailesi",key:"head",name:"Quintus Fabius Maximus",gender:"MALE",age:47,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Fabius ailesi",key:"spouse",name:"Livia Drusa",gender:"FEMALE",age:41,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Fabius ailesi",key:"child_one",name:"Marcus Fabius Maximus",gender:"MALE",age:19,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Fabius ailesi",key:"child_two",name:"Fabia Maxima",gender:"FEMALE",age:16,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Fabius ailesi",key:"head_sibling",name:"Kaeso Fabius Maximus",gender:"MALE",age:43,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Fabius ailesi",key:"spouse_sibling",name:"Publius Livius Drusus",gender:"MALE",age:37,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Valerius ailesi",key:"head",name:"Marcus Valerius Messalla",gender:"MALE",age:45,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Valerius ailesi",key:"spouse",name:"Terentia Varrona",gender:"FEMALE",age:39,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Valerius ailesi",key:"child_one",name:"Manius Valerius Messalla",gender:"MALE",age:18,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Valerius ailesi",key:"child_two",name:"Valeria Messalla",gender:"FEMALE",age:14,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Valerius ailesi",key:"head_sibling",name:"Publius Valerius Messalla",gender:"MALE",age:41,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Valerius ailesi",key:"spouse_sibling",name:"Tullia Varrona",gender:"FEMALE",age:35,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Licinius ailesi",key:"head",name:"Publius Licinius Crassus",gender:"MALE",age:46,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Licinius ailesi",key:"spouse",name:"Mucia Tertia",gender:"FEMALE",age:40,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Licinius ailesi",key:"child_one",name:"Gaius Licinius Crassus",gender:"MALE",age:19,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Licinius ailesi",key:"child_two",name:"Licinia Crassa",gender:"FEMALE",age:15,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Licinius ailesi",key:"head_sibling",name:"Lucius Licinius Crassus",gender:"MALE",age:42,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Licinius ailesi",key:"spouse_sibling",name:"Quintus Mucius Tertius",gender:"MALE",age:36,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Junius ailesi",key:"head",name:"Decimus Junius Silanus",gender:"MALE",age:44,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Junius ailesi",key:"spouse",name:"Sempronia Graccha",gender:"FEMALE",age:38,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Junius ailesi",key:"child_one",name:"Marcus Junius Silanus",gender:"MALE",age:17,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Junius ailesi",key:"child_two",name:"Junia Silana",gender:"FEMALE",age:13,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Junius ailesi",key:"head_sibling",name:"Lucius Junius Silanus",gender:"MALE",age:40,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Junius ailesi",key:"spouse_sibling",name:"Gaius Sempronius Gracchus",gender:"MALE",age:34,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Servilius ailesi",key:"head",name:"Gnaeus Servilius Caepio",gender:"MALE",age:49,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Servilius ailesi",key:"spouse",name:"Claudia Pulchra",gender:"FEMALE",age:42,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Servilius ailesi",key:"child_one",name:"Quintus Servilius Caepio",gender:"MALE",age:21,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Servilius ailesi",key:"child_two",name:"Servilia Caepionis",gender:"FEMALE",age:18,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Servilius ailesi",key:"head_sibling",name:"Marcus Servilius Caepio",gender:"MALE",age:45,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Servilius ailesi",key:"spouse_sibling",name:"Appius Claudius Pulcher",gender:"MALE",age:39,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6},

  {familyName:"Caecilius ailesi",key:"head",name:"Quintus Caecilius Metellus",gender:"MALE",age:51,position:"HEAD",relation:"Aile yöneticisi",spouseKey:"spouse",sortOrder:1},
  {familyName:"Caecilius ailesi",key:"spouse",name:"Calpurnia Pisona",gender:"FEMALE",age:44,position:"SPOUSE",relation:"Yöneticinin eşi",spouseKey:"head",sortOrder:2},
  {familyName:"Caecilius ailesi",key:"child_one",name:"Lucius Caecilius Metellus",gender:"MALE",age:23,position:"CHILD",relation:"Yöneticinin oğlu",motherKey:"spouse",fatherKey:"head",sortOrder:3},
  {familyName:"Caecilius ailesi",key:"child_two",name:"Caecilia Metella",gender:"FEMALE",age:19,position:"CHILD",relation:"Yöneticinin kızı",motherKey:"spouse",fatherKey:"head",sortOrder:4},
  {familyName:"Caecilius ailesi",key:"head_sibling",name:"Gaius Caecilius Metellus",gender:"MALE",age:47,position:"HEAD_SIBLING",relation:"Yöneticinin kardeşi",sortOrder:5},
  {familyName:"Caecilius ailesi",key:"spouse_sibling",name:"Lucius Calpurnius Piso",gender:"MALE",age:40,position:"SPOUSE_SIBLING",relation:"Yönetici eşinin kardeşi",sortOrder:6}
];
