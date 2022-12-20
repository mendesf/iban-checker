require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const { executablePath } = require("puppeteer");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");

puppeteer.use(StealthPlugin());

const IBAN_CHECKER_URL = process.env.IBAN_CHECKER_URL;

const getBrowser = () => {
  return puppeteer.launch({
    headless: false,
    executablePath: executablePath(),
  });
};

const ibanChecker = async (browser, iban) => {
  const handleError = (err, message) => {
    console.log(message);
    page.screenshot({ path: path.join(__dirname, `error_${Date.now()}.png`) });
    throw err;
  };

  const page = await browser.newPage();

  await page.goto(IBAN_CHECKER_URL, { waitUntil: "networkidle2" });
  await page
    .type("#iban-number", iban)
    .catch((err) => handleError(err, "Error typing iban number."));

  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]'),
  ]);

  try {
    const error = await page.$$eval(
      'div[role="alert"].alert.alert-warning',
      ([node]) => node?.querySelector("p").innerHTML
    );
    if (error) return { error };
  } catch (err) {
    handleError(err, "Error querying alert.");
  }

  const getBankDetais = async () => {
    try {
      return await page.$$eval("div.bg-default", ([node]) => ({
        address: node?.querySelector("p.small").innerHTML,
        bankName: node?.querySelector("img.bank-logo").getAttribute("alt"),
      }));
    } catch (err) {
      handleError(err, "Error querying bank details.");
    }
  };

  const getIbanDetails = async () => {
    try {
      return await page.$$eval(".iban-breakdown__item", (nodes) =>
        nodes
          .map((node) => {
            const code = node.querySelector(".iban-breakdown__code").innerHTML;
            const [first, ...rest] = node
              .querySelector(".iban-breakdown__label")
              .textContent.split(" ");
            const label =
              first.toLowerCase() +
              rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

            return { [label]: code };
          })
          .reduce((prop, obj) => ({ ...prop, ...obj }), {})
      );
    } catch (err) {
      handleError(err, "Error querying iban details.");
    }
  };

  const bankDetails = await getBankDetais();
  const ibanDetails = await getIbanDetails();

  return { ...bankDetails, ...ibanDetails };
};

(async () => {
  const [iban] = process.argv.slice(2);
  try {
    const browser = await getBrowser();
    const result = await ibanChecker(browser, iban);
    await browser.close();
    console.log(result);
  } catch (err) {
    console.log(err);
  }
})();
