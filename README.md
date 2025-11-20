# 🚗 Volanteomaleta.com Vehicle Data Scraper

Simple and efficient web scraper to extract vehicle data from volanteomaleta.com.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure the Scraper

Edit `scraper.js` and set your input/output files:

```javascript
const CONFIG = {
    platesFile: path.join(__dirname, 'data/plates/plates-1.csv'),
    vehicleDataFile: path.join(__dirname, 'data/results/vehicle-data.csv'),
    progressFile: path.join(__dirname, 'progress/scraping-progress.json'),
}
```

### 3. Run the Scraper

```bash
node scraper.js
```

That's it! The scraper will:
- ✅ Load plates from your CSV
- ✅ Scrape volanteomaleta.com for each plate
- ✅ Save results to `vehicle-data.csv`
- ✅ Track progress automatically
- ✅ Resume if interrupted

## 📁 Project Structure

```
cloudflare-demo/
├── scraper.js                    # Main scraper (all-in-one)
├── data/
│   ├── plates/                   # Input: plate CSV files
│   │   ├── plates-1.csv
│   │   ├── plates-2.csv
│   │   └── ...
│   └── results/
│       └── vehicle-data.csv      # Output: scraped vehicle data
├── progress/
│   └── scraping-progress.json    # Auto-saved progress
└── generate-update-sql.js        # SQL generator for database updates
```

## 📊 Input Format

Your plates CSV should look like:
```csv
Plate Number
ABC123
XYZ789
```

## 📝 Output Format

Results are saved in CSV with these columns:
- Row #
- Plate Number
- Vehicle Type
- Brand
- Model
- Owner RUT
- Engine Number
- Year
- Owner Name
- Scraping Date
- Source Website

## ⚙️ Features

- **Auto-Resume**: Stops and starts? No problem! Progress is saved automatically every 10 plates
- **Smart Retries**: Failed requests retry up to 3 times
- **Progress Tracking**: See real-time stats every 100 plates
- **Minimal Browser**: Small, minimized window - no distracting popups
- **Respectful Delays**: 0.5s delay between requests

## 🔄 Resume Scraping

If the scraper stops (Ctrl+C or crash), just run it again:
```bash
node scraper.js
```

It will automatically continue from where it left off using `progress/scraping-progress.json`.

## 🎯 Processing Multiple Plate Files

Want to scrape different files? Just change the config in `scraper.js`:

```javascript
// First run
const CONFIG = {
    platesFile: path.join(__dirname, 'data/plates/plates-1.csv'),
    vehicleDataFile: path.join(__dirname, 'data/results/vehicle-data.csv'),
    progressFile: path.join(__dirname, 'progress/scraping-progress.json'),
}

// Later, for second batch
const CONFIG = {
    platesFile: path.join(__dirname, 'data/plates/plates-2.csv'),
    vehicleDataFile: path.join(__dirname, 'data/results/vehicle-data.csv'),  // Same output file
    progressFile: path.join(__dirname, 'progress/scraping-progress-2.json'), // Different progress file
}
```

## 🛠️ Generate SQL Updates

After scraping, generate SQL update statements:

```bash
node generate-update-sql.js
```

This creates `update-leads.sql` with UPDATE statements for your database.

## 📈 Monitor Progress

Check `progress/scraping-progress.json` to see:
- Current index
- Total plates
- Success/error counts
- Percentage complete
- Timestamp

Or watch the console output for real-time stats!

## ⚡ Performance

- **Speed**: ~500ms per plate (7,200 plates/hour)
- **Success Rate**: ~84% (plates with data found)
- **Cost**: Essentially free (just electricity)

## 🛑 Stop Gracefully

Press `Ctrl+C` to stop. Progress is automatically saved, and you can resume anytime.

## 📦 Dependencies

- `puppeteer` - Browser automation
- Node.js built-in modules (fs, path)

## 📄 License

MIT - See LICENSE file

---

**Note**: Be respectful when scraping. This tool includes delays between requests to avoid overloading the target website.
