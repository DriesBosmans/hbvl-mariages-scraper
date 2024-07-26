import { Page, test } from "@playwright/test";
import fs from "fs";
import { Marriage, Person } from "../types";

test("scrapeHbvl", async ({ page }) => {
  // https://www.hbvl.be/regio/genk?t=limburgtrouwt
  enum Locations {
    Beringen = "beringen",
    Hasselt = "hasselt",
    Tongeren = "tongeren",
    Genk = "genk",
    Lommel = "lommel",
    SintTruiden = "sint-truiden",
    Maasmechelen = "maasmechelen",
  }
  const ignoreList = [
    "https://www.hbvl.be/cnt/dmf20230619_93249761",
    "https://www.hbvl.be/cnt/dmf20230925_93876955",
  ];
  const domain = "https://www.hbvl.be/";
  const area = "regio/";
  const urlEnd = "?t=limburgtrouwt";
  const locationKeys = Object.values(Locations);
  const filePath = "./marriages.csv";
  let counter = 0;
  let marriageCsv;
  fs.readFile(filePath, "UTF-8", (err, data) => {
    if (err) throw err;
    marriageCsv = data.toString();
  });

  for (const key of locationKeys) {
    await page.goto(`${domain}${area}${key}${urlEnd}`);
    await acceptCookies(page);
    await loadFullPage(page);
    const urlList = await getMainUrlList(page);

    for (const url of urlList) {
      if (marriageCsv.indexOf(url) > -1) continue;
      let exit = false;
      for (const ignoreUrl of ignoreList) {
        if (url === ignoreUrl) exit = true;
      }
      if (exit) continue;

      const data: string[] = await getContent(page, url);
      if (data.length < 1) continue;
      const cleanedContent = cleanContent(data);
      console.log(
        cleanedContent.person1.name,
        " & ",
        cleanedContent.person2.name
      );
      if (marriageCsv === "")
        fs.appendFile(filePath, getHeaders(cleanedContent), () => {});
      marriageCsv += convertToCsv(cleanedContent);
      counter++;
      console.log(`${counter} marriages saved.`);
      fs.appendFile(filePath, convertToCsv(cleanedContent), () => {});
    }
  }
});
// david claudio https://www.hbvl.be//cnt/dmf20240625_93485424
const acceptCookies = async (page: Page) => {
  const acceptCookiesButton = page.locator("button#didomi-notice-agree-button");
  if (await acceptCookiesButton.isVisible()) {
    await acceptCookiesButton.click();
  }
};

const loadFullPage = async (page: Page) => {
  const showMoreButton = page.locator('button[data-testid="show-more"]');
  await page.waitForTimeout(1000);
  if (
    showMoreButton &&
    (await showMoreButton.isVisible({
      timeout: 4000,
    }))
  ) {
    await showMoreButton.click();
    await loadFullPage(page);
  } else return;
};

const getMainUrlList = async (page: Page): Promise<string[]> => {
  const anchorTagArray = await page
    .locator("section > div > div > ul > li > a")
    .all();

  const hrefs: string[] = [];
  for (const anchor of anchorTagArray) {
    const textContent = (await anchor.getAttribute(
      "data-vr-contentbox"
    )) as string;
    if (textContent.indexOf("Pas getrouwd") === -1) continue;
    hrefs.push((await anchor.getAttribute("data-vr-contentbox-url")) as string);
  }
  return hrefs;
};

const getContent = async (page: Page, url: string): Promise<string[]> => {
  await page.goto(url);
  try {
    const articleBodyItems = await page
      .locator('div[data-testid="article-body"] p')
      .all();
    if (articleBodyItems.length < 1) {
      console.log("no items");
      return [];
    }
    const firstParagraph = (await articleBodyItems[0].textContent()) as string;
    if (firstParagraph?.length > 300) {
      console.log("Large article");
      return [];
    }

    const imageUrl = await page
      .locator('figure[data-testid="article-image-wrapper"] div div img')
      .nth(0)
      .getAttribute("src");
    const articleLocation = await page
      .locator('div[data-testid="article-intro"] span')
      .textContent();
    const dateTime = await page
      .locator('time[data-testid="article-date"]')
      .textContent();
    const person1 = await articleBodyItems[0].textContent();
    const person2 = await articleBodyItems[1].textContent();
    const thirdParagraph = await articleBodyItems[2].textContent();
    // if the second paragraph contains "Kinderen", the third paragraph becomes whereMet
    const haveChildren = checkForKids(thirdParagraph);

    const children = haveChildren ? thirdParagraph : "";
    const whereMet = haveChildren
      ? await articleBodyItems[3].textContent()
      : thirdParagraph;
    return [
      person1,
      person2,
      dateTime,
      articleLocation,
      children,
      whereMet,
      imageUrl,
      url,
    ] as string[];
  } catch (err) {
    console.log("error in getContent(): " + err);
    return [];
  }
};

const cleanContent = (content: string[]): Marriage => {
  return {
    location: content[3],
    date: content[2],
    person1: getPersonInfo(content[0]),
    person2: getPersonInfo(content[1]),
    children: content[4],
    whereMet: content[5],
    imageUrl: content[6],
    url: content[7],
  };
};

const getPersonInfo = (person: string): Person => {
  const name = person.indexOf("(") > -1 ? person.split("(")[0].trim() : person;
  const age =
    person.indexOf("(") > -1 && person.indexOf(")") > -1
      ? person.split("(")[1].split(")")[0]
      : person;
  const location =
    person.indexOf("uit ") > -1
      ? person.split("uit ")[1].split(",")[0].trim()
      : person;
  const job = person.indexOf(", ") > -1 ? person.split(", ")[1].trim() : person;
  return { name, age, location, job };
};

const checkForKids = (x: string): boolean => {
  return x.includes("Kinderen");
};

const convertToCsv = (cleanedJson: Marriage): string => {
  let csvLine = "";
  const flattenedMarriage = flattenObject(cleanedJson);
  for (const element in flattenedMarriage) {
    csvLine += `${flattenedMarriage[element]};`;
  }
  csvLine += "\n";
  return csvLine;
};

const flattenObject = (obj: any): any => {
  let resultObj: any = {};

  for (const i in obj) {
    if (typeof obj[i] === "object" && !Array.isArray(obj[i])) {
      // Recursively invoking the funtion
      // until the object gets flatten
      const tempObj = flattenObject(obj[i]);
      for (const j in tempObj) {
        resultObj[i + "." + j] = tempObj[j];
      }
    } else {
      resultObj[i] = obj[i];
    }
  }
  return resultObj;
};

const getHeaders = (cleanedJson: Marriage): string => {
  const flattenedMarriage = flattenObject(cleanedJson);
  const keys = Object.keys(flattenedMarriage);
  return `${keys.join(";")}\n`;
};
