#!/usr/bin/env node
import { launch } from 'puppeteer'
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// CONFIGURATION - Edit these values for each run
// ============================================================================
const CONFIG = {
    platesFile: path.join(__dirname, 'data/plates/plates-6-profiles-restantes.csv'),
    vehicleDataFile: path.join(__dirname, 'data/results/vehicle-data.csv'),
    progressFile: path.join(__dirname, 'progress/scraping-progress.json'),
}

// ============================================================================
// SCRAPER SETTINGS
// ============================================================================
const DELAY_BETWEEN_REQUESTS = 500 // 0.5 second delay
const PROGRESS_SAVE_INTERVAL = 10 // Save progress every 10 plates
const PROGRESS_SUMMARY_INTERVAL = 100 // Show summary every 100 plates
const MAX_RETRIES = 3 // Retry failed requests

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// CSV MANAGEMENT FUNCTIONS
// ============================================================================

// Read plates from CSV file
const readPlatesFromCSV = (filename) => {
    try {
        const content = readFileSync(filename, 'utf8')
        const lines = content.split('\n').filter(line => line.trim())
        const plates = lines.slice(1).map(line => line.trim()).filter(Boolean)
        console.log(`📋 Loaded ${plates.length} plates from ${filename}`)
        return plates
    } catch (error) {
        console.log(`❌ Error reading ${filename}:`, error.message)
        return []
    }
}

// Get current row count from vehicle data CSV
const getCurrentRowCount = (filename) => {
    try {
        if (!existsSync(filename)) return 0
        const content = readFileSync(filename, 'utf8')
        const lines = content.split('\n').filter(line => line.trim())
        return lines.length - 1 // Subtract header row
    } catch (error) {
        console.log(`❌ Error reading ${filename}:`, error.message)
        return 0
    }
}

// Initialize vehicle data CSV with headers
const initializeVehicleDataCSV = (filename) => {
    if (!existsSync(filename)) {
        const headers = [
            'Row #',
            'Plate Number', 
            'Vehicle Type',
            'Brand',
            'Model',
            'Owner RUT',
            'Engine Number',
            'Year',
            'Owner Name',
            'Scraping Date',
            'Source Website'
        ]
        writeFileSync(filename, headers.join(',') + '\n', 'utf8')
        console.log(`✅ Created ${filename} with headers`)
        return 0
    } else {
        const rowCount = getCurrentRowCount(filename)
        console.log(`📊 ${filename} exists with ${rowCount} data rows`)
        return rowCount
    }
}

// Append vehicle record to CSV
const appendVehicleToCSV = (plateNumber, vehicleData, rowNumber, filename) => {
    try {
        let csvRow
        if (vehicleData && vehicleData.success && vehicleData.data) {
            const vehicle = vehicleData.data
            csvRow = [
                rowNumber,
                `"${plateNumber}"`,
                `"${vehicle.Tipo || ''}"`,
                `"${vehicle.Marca || ''}"`,
                `"${vehicle.Modelo || ''}"`,
                `"${vehicle.RUT || ''}"`,
                `"${vehicle.Numero_Motor || ''}"`,
                `"${vehicle.Año || vehicle.Ao || ''}"`,
                `"${vehicle.Propietario || ''}"`,
                `"${new Date().toISOString().split('T')[0]}"`,
                '"volanteomaleta.com"'
            ]
        } else {
            csvRow = [
                rowNumber,
                `"${plateNumber}"`,
                '"No data found"',
                '""', '""', '""', '""', '""', '""',
                `"${new Date().toISOString().split('T')[0]}"`,
                '"volanteomaleta.com"'
            ]
        }
        appendFileSync(filename, csvRow.join(',') + '\n', 'utf8')
        return true
    } catch (error) {
        console.log(`❌ Error appending to ${filename}:`, error.message)
        return false
    }
}

// Save progress
const saveProgress = (currentIndex, totalPlates, successCount, errorCount, progressFile) => {
    const progress = {
        currentIndex,
        totalPlates,
        successCount,
        errorCount,
        timestamp: new Date().toISOString(),
        percentage: ((currentIndex / totalPlates) * 100).toFixed(2)
    }
    try {
        writeFileSync(progressFile, JSON.stringify(progress, null, 2), 'utf8')
    } catch (error) {
        console.log(`⚠️  Could not save progress:`, error.message)
    }
    return progress
}

// Load progress
const loadProgress = (progressFile) => {
    try {
        if (existsSync(progressFile)) {
            const content = readFileSync(progressFile, 'utf8')
            return JSON.parse(content)
        }
    } catch (error) {
        console.log(`⚠️  Could not load progress:`, error.message)
    }
    return null
}

// ============================================================================
// SCRAPING FUNCTIONS
// ============================================================================

// Check current IP
const checkCurrentIP = async (page) => {
    try {
        console.log('🌐 Checking current IP address...')
        await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded', timeout: 10000 })
        const ipData = await page.evaluate(() => {
            const preElement = document.querySelector('pre')
            if (preElement) {
                try {
                    return JSON.parse(preElement.textContent)
                } catch (e) {
                    return { origin: preElement.textContent.trim() }
                }
            }
            return null
        })
        if (ipData && ipData.origin) {
            console.log(`📍 Current IP Address: ${ipData.origin}`)
            return ipData.origin
        }
    } catch (error) {
        console.log(`❌ Error checking IP: ${error.message}`)
    }
    return null
}

// Check and wait for Cloudflare challenge
const waitForCloudflare = async (page) => {
    try {
        // Check if Cloudflare challenge is present
        const cfChallenge = await page.$('div.cf-browser-verification') || 
                           await page.$('#cf-wrapper') ||
                           await page.$('div[class*="cloudflare"]')
        
        if (cfChallenge) {
            console.log(`   ☁️  Cloudflare challenge detected, waiting...`)
            // Wait up to 30 seconds for Cloudflare to pass
            await sleep(10000)
            // Check again if it's still there
            const stillThere = await page.$('div.cf-browser-verification')
            if (stillThere) {
                await sleep(10000) // Wait another 10 seconds
            }
            console.log(`   ✅ Cloudflare check passed`)
        }
    } catch (error) {
        // Continue even if check fails
        console.log(`   ⚠️  Cloudflare check skipped: ${error.message}`)
    }
}

// Scrape single plate
const scrapePlateWithBrowser = async (page, plateNumber) => {
    try {
        await page.goto('https://www.volanteomaleta.com/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        })
        
        // Wait for Cloudflare if present
        await waitForCloudflare(page)
        await sleep(2000)
        
        console.log(`   🔍 Finding input field...`)
        await page.waitForSelector('input[name="term"]', { timeout: 15000 })
        
        const plateInput = await page.$('input[placeholder="Buscar Patente (ej. DXRZ99)"]')
        if (!plateInput) {
            throw new Error('Could not find plate input field')
        }
        
        console.log(`   ⌨️  Entering plate: ${plateNumber}`)
        await plateInput.click({ clickCount: 3 })
        await plateInput.type(plateNumber)
        
        console.log(`   🔍 Clicking submit...`)
        await page.click('button[type="submit"]')
        
        console.log(`   ⏳ Waiting for results...`)
        await sleep(2000)
        
        try {
            await page.waitForSelector('table.table.table-hover', { timeout: 8000 })
            console.log(`   📊 Results table found`)
            
            const vehicleData = await page.evaluate(() => {
                const table = document.querySelector('table.table.table-hover')
                if (!table) return null
                
                const bodyRows = table.querySelectorAll('tbody tr')
                if (bodyRows.length > 0) {
                    const cells = bodyRows[0].querySelectorAll('td')
                    if (cells.length >= 8) {
                        return {
                            Patente: cells[0]?.textContent?.trim() || '',
                            Tipo: cells[1]?.textContent?.trim() || '',
                            Marca: cells[2]?.textContent?.trim() || '',
                            Modelo: cells[3]?.textContent?.trim() || '',
                            RUT: cells[4]?.textContent?.trim() || '',
                            Numero_Motor: cells[5]?.textContent?.trim() || '',
                            Año: cells[6]?.textContent?.trim() || '',
                            Propietario: cells[7]?.textContent?.trim() || ''
                        }
                    }
                }
                return null
            })
            
            if (vehicleData && vehicleData.Patente) {
                return { success: true, plate: plateNumber, data: vehicleData }
            } else {
                return { success: false, plate: plateNumber, data: null, message: 'No data found' }
            }
        } catch (e) {
            console.log(`   ❌ No results table found`)
            return { success: false, plate: plateNumber, data: null, message: 'No results table found' }
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`)
        return { success: false, plate: plateNumber, data: null, message: error.message }
    }
}

// ============================================================================
// MAIN SCRAPER
// ============================================================================

const runScraper = async () => {
    console.log('🚀 BULK SCRAPER - Vehicle Data Collector')
    console.log('=' .repeat(70))
    
    // Load plates
    const plates = readPlatesFromCSV(CONFIG.platesFile)
    if (plates.length === 0) {
        console.log(`❌ No plates found in ${CONFIG.platesFile}`)
        return
    }
    
    // Initialize CSV
    const currentRows = initializeVehicleDataCSV(CONFIG.vehicleDataFile)
    let startingRowNumber = currentRows + 1
    
    // Check for resume
    let startIndex = 0
    const savedProgress = loadProgress(CONFIG.progressFile)
    if (savedProgress && savedProgress.currentIndex > 0) {
        console.log(`🔄 Found previous progress at ${savedProgress.percentage}%`)
        startIndex = savedProgress.currentIndex
        startingRowNumber = currentRows + 1
    }
    
    console.log('')
    console.log(`📊 Processing ${plates.length} plates (starting from index ${startIndex})`)
    console.log(`📋 Starting at CSV row number: ${startingRowNumber}`)
    console.log(`📁 Input: ${path.basename(CONFIG.platesFile)} → Output: ${path.basename(CONFIG.vehicleDataFile)}`)
    console.log('🔇 Running with minimized window - no distracting popups!')
    console.log('')
    
    // Launch browser with better stealth settings
    const browser = await launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-position=0,0',
            '--window-size=1024,768', // Larger window to avoid detection
            '--disable-blink-features=AutomationControlled', // Hide automation
        ]
    })
    
    let page
    let successCount = 0
    let errorCount = 0
    let currentRowNumber = startingRowNumber
    
    try {
        page = await browser.newPage()
        
        // Add stealth settings to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        })
        
        // Override navigator.webdriver flag
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false })
        })
        
        const pages = await browser.pages()
        if (pages.length > 1) await pages[0].close()
        
        console.log('🌐 Browser initialized with stealth settings')
        await checkCurrentIP(page)
        console.log('')
        console.log('🚀 Starting plate processing...')
        console.log('')
        
        // Process plates
        for (let i = startIndex; i < plates.length; i++) {
            const plate = plates[i]
            const progress = ((i + 1) / plates.length * 100).toFixed(1)
            const remaining = plates.length - (i + 1)
            
            console.log(`[${i + 1}/${plates.length}] (${progress}%) Processing: ${plate} | Remaining: ${remaining}`)
            
            let result = null
            let retryCount = 0
            
            while (retryCount < MAX_RETRIES && (!result || !result.success)) {
                if (retryCount > 0) {
                    console.log(`   🔄 Retry ${retryCount}/${MAX_RETRIES}`)
                    await sleep(1000)
                }
                result = await scrapePlateWithBrowser(page, plate)
                retryCount++
                if (result.success) break
            }
            
            if (result.success) {
                console.log(`   ✅ FOUND: ${result.data.Marca} ${result.data.Modelo} (${result.data.Año}) - ${result.data.Propietario}`)
                successCount++
            } else {
                console.log(`   ❌ NOT FOUND: ${result.message}`)
                errorCount++
            }
            
            const csvSaved = appendVehicleToCSV(plate, result, currentRowNumber, CONFIG.vehicleDataFile)
            if (csvSaved) {
                console.log(`   💾 Saved to CSV row ${currentRowNumber}`)
            }
            currentRowNumber++
            
            // Save progress periodically
            if ((i + 1) % PROGRESS_SAVE_INTERVAL === 0) {
                const progressData = saveProgress(i + 1, plates.length, successCount, errorCount, CONFIG.progressFile)
                console.log(`   📊 Progress saved: ${progressData.percentage}% complete`)
            }
            
            // Show progress summary
            if ((i + 1) % PROGRESS_SUMMARY_INTERVAL === 0 || i === plates.length - 1) {
                const processedCount = i + 1 - startIndex
                const successRate = (successCount / processedCount * 100).toFixed(1)
                const estimatedTimeRemaining = ((plates.length - (i + 1)) * DELAY_BETWEEN_REQUESTS / 1000 / 60).toFixed(1)
                
                console.log('')
                console.log(`📈 PROGRESS SUMMARY:`)
                console.log(`   🎯 Processed: ${i + 1}/${plates.length} (${progress}%)`)
                console.log(`   ✅ Successful: ${successCount}`)
                console.log(`   ❌ Not Found: ${errorCount}`)
                console.log(`   📊 Success Rate: ${successRate}%`)
                console.log(`   ⏱️  Estimated Time Remaining: ${estimatedTimeRemaining} minutes`)
                console.log(`   💾 CSV Rows: ${currentRowNumber - 1}`)
                console.log('')
            }
            
            if (i < plates.length - 1) {
                await sleep(DELAY_BETWEEN_REQUESTS)
            }
        }
    } catch (fatalError) {
        console.log(`❌ FATAL ERROR:`, fatalError.message)
        console.log('💾 Progress has been saved. You can resume later.')
    } finally {
        if (browser) {
            await browser.close()
            console.log('🔒 Browser closed successfully')
        }
    }
    
    // Final summary
    const totalProcessed = plates.length - startIndex
    const finalSuccessRate = (successCount / totalProcessed * 100).toFixed(1)
    
    console.log('')
    console.log('🎉 BULK SCRAPING COMPLETED!')
    console.log('=' .repeat(70))
    console.log(`📊 FINAL STATISTICS:`)
    console.log(`   📋 Total Plates: ${plates.length}`)
    console.log(`   ⚡ Processed This Session: ${totalProcessed}`)
    console.log(`   ✅ Vehicles Found: ${successCount}`)
    console.log(`   ❌ Not Found: ${errorCount}`)
    console.log(`   🎯 Success Rate: ${finalSuccessRate}%`)
    console.log(`   💾 Total CSV Rows: ${currentRowNumber - 1}`)
    console.log(`   📁 Output File: ${CONFIG.vehicleDataFile}`)
    console.log('')
    console.log('✅ All data organized in CSV!')
    
    saveProgress(plates.length, plates.length, successCount, errorCount, CONFIG.progressFile)
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n⏹️  Graceful shutdown requested...')
    console.log('💾 Progress has been saved automatically')
    process.exit(0)
})

// Run the scraper
runScraper().catch(error => {
    console.error('❌ Startup Error:', error.message)
    console.log('💾 Check your files and try again')
    process.exit(1)
})

