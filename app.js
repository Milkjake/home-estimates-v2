const fs = require("fs");
const axios = require("axios");
var Promise = require("bluebird");
const csv = require("csv-parser");
const fastcsv = require("fast-csv");
const cliProgress = require("cli-progress");

const ADDRESS_URI = "https://www.homes.co.nz/address";
const CONCURRENCY = 10;

const args = process.argv.slice(2);

(async function () {
  if (args.length === 0) {
    console.log("Please provide a suburb to query");
    return 1;
  }

  const suburbToQuery = args[0].toLowerCase();
  let suburbData = [];

  const start = Date.now();

  if (fs.existsSync(`csv/${suburbToQuery}/${suburbToQuery}.csv`)) {
    console.log(`Fetching estimates for ${suburbToQuery}`);

    const bar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );

    processCsv(
      `csv/${suburbToQuery}/${suburbToQuery}.csv`,
      function (row) {
        suburbData = [...suburbData, row];
      },
      async function () {
        bar.start(suburbData.length, 0);

        let data = await Promise.map(
          suburbData,
          async function (suburb) {
            try {
              const { full_address } = suburb;

              const res = await axios.get(
                "https://gateway.homes.co.nz/address/search",
                {
                  params: { Address: full_address },
                }
              );

              const { Results, Error } = res.data;

              if (Results && Results.length > 0) {
                const { Title, Lat, Long, StreetNumber, Street, Suburb, City } =
                  Results[0];

                const res = await axios.get(
                  "https://gateway.homes.co.nz/property/resolve",
                  {
                    params: {
                      address: Title,
                      lat: Lat,
                      long: Long,
                      street_number: StreetNumber,
                      street: Street,
                      suburb: Suburb,
                      city: City,
                    },
                  }
                );

                const { property_id, error } = res.data;

                if (property_id) {
                  const res = await axios.get(
                    "https://gateway.homes.co.nz/properties",
                    {
                      params: {
                        property_ids: property_id,
                      },
                    }
                  );

                  const { cards, error } = res.data;

                  if (cards && cards.length > 0) {
                    const {
                      date,
                      url,
                      property_details: {
                        address,
                        display_estimated_value_short,
                        display_estimated_lower_value_short,
                        display_estimated_upper_value_short,
                      },
                    } = cards[0];

                    return {
                      full_address: address,
                      estimate_date: new Date(date).toLocaleDateString(),
                      estimate_value: "$" + display_estimated_value_short,
                      estimate_range:
                        "$" +
                        display_estimated_lower_value_short +
                        " - $" +
                        display_estimated_upper_value_short,
                      link: ADDRESS_URI + url,
                    };
                  }
                }
              }
            } catch (err) {
              throw err;
            } finally {
              bar.increment();
            }

            return null;
          },
          { concurrency: CONCURRENCY }
        );

        // filter out null values
        const filteredData = data.filter((d) => d !== null);

        writeCsv(suburbToQuery, `${suburbToQuery}-estimates`, filteredData);

        bar.stop();

        console.log(`Total elapsed time: ${msToTime(Date.now() - start)}`);
      }
    );
  } else {
    console.log(`Data for ${suburbToQuery} does not exist, creating new file`);

    processCsv(
      "csv/nz-street-address.csv",
      function (row) {
        const { suburb_locality } = row;
        if (suburbToQuery === suburb_locality.toLowerCase()) {
          suburbData = [...suburbData, row];
        }
      },
      function () {
        if (!fs.existsSync(`csv/${suburbToQuery}`)) {
          fs.mkdirSync(`csv/${suburbToQuery}`);
        }
        writeCsv(suburbToQuery, suburbToQuery, suburbData);

        console.log(`Total elapsed time: ${msToTime(Date.now() - start)}`);
      }
    );
  }
})();

function processCsv(path, onDataFunc, onEndFunc) {
  fs.createReadStream(path)
    .pipe(csv())
    .on("data", (row) => {
      onDataFunc(row);
    })
    .on("error", (err) => {
      console.log("Error while processing CSV file");
      console.log(err);
    })
    .on("end", () => {
      console.log("CSV file successfully processed");
      onEndFunc();
    });
}

function writeCsv(suburb, filename, data) {
  const ws = fs.createWriteStream(`csv/${suburb}/${filename}.csv`);

  fastcsv.write(data, { headers: true }).pipe(ws);
}

function msToTime(ms) {
  let seconds = (ms / 1000).toFixed(1);
  let minutes = (ms / (1000 * 60)).toFixed(1);
  let hours = (ms / (1000 * 60 * 60)).toFixed(1);
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);
  if (seconds < 60) return seconds + " Sec";
  else if (minutes < 60) return minutes + " Min";
  else if (hours < 24) return hours + " Hrs";
  else return days + " Days";
}
