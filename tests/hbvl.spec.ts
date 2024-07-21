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
  const domain = "https://www.hbvl.be/";
  const area = "regio/";
  const urlEnd = "?t=limburgtrouwt";
  const locationKeys = Object.values(Locations);
  const filePath = "./marriages.csv";
  fs.writeFile(filePath, "", () => {});
  for (const key of locationKeys) {
    await page.goto(`${domain}${area}${key}${urlEnd}`);
    await acceptCookies(page);
    await loadFullPage(page);
    const urlList = await getMainUrlList(page);
    let marriageCsv = "";
    let counter = 0;
    for (const url of urlList) {
      const data: string[] = await getContent(page, `${domain}${url}`);
      if (data.length < 1) continue;
      const cleanedContent = cleanContent(data);
      console.log(
        cleanedContent.person1.name,
        " & ",
        cleanedContent.person2.name
      );
      marriageCsv += convertToCsv(cleanedContent);
      counter++;
      console.log(`${counter} marriages saved.`);
      if (url === urlList[0])
        fs.appendFile(filePath, getHeaders(cleanedContent), () => {});
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
  const hrefArray: string[] = [];
  for (const anchor of anchorTagArray) {
    const href = await anchor.getAttribute("href");
    hrefArray.push(href as string);
  }
  return hrefArray;
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
  const name = person.split("(")[0].trim();
  const age = person.split("(")[1].split(")")[0];
  const location = person.split("uit ")[1].split(",")[0].trim();
  const hasJob = person.indexOf(", ") > -1;
  const job = hasJob ? person.split(", ")[1].trim() : "";
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
