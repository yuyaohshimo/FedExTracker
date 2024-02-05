# FedExTracker

FedExTracker is a tool that allows you to retrieve FedEx tracking information directly through FedEx's API. It takes a list of tracking numbers from an input file and outputs the current status of each package.

## Using FedExTracker

To use FedExTracker, follow these steps:

1. Install the dependencies

```bash
pnpm install
```

2. Set up your environment

```.dotenv
FEDEX_CLIENT_ID=your_client_id
FEDEX_CLIENT_SECRET=your_client_secret
```

3. Update the `input.csv` file with your FedEx tracking numbers.

```csv
123456789012
987654321098
...
```

4. Run the script

```bash
pnpm exec ts-node main.ts
```

You should see output similar to this:

```bash
123456789012,Delivered
987654321098,In Transit
...
```