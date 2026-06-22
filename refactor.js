const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');
const routesDir = path.join(__dirname, 'routes');

const replacements = {
  'electricity_meters': 'meters',
  'meter_number': 'meterNo',
  'meter_name': 'customerName',
  'meter_type': 'meterType',
  'relay_status': 'relayStatus',
  'tariff_per_unit': 'tariff'
};

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = path.join(directory, file);
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;
      
      for (const [oldStr, newStr] of Object.entries(replacements)) {
        const regex = new RegExp(oldStr, 'g');
        content = content.replace(regex, newStr);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
      }
    }
  }
}

processDirectory(controllersDir);
processDirectory(routesDir);

console.log("Refactoring complete.");
