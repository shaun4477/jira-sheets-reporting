var INSTRUCTIONS_SHEET = 'Instructions';

var SheetsReporter = (function () {
  function SheetsReporter() {
    var percentWhiteToGreen = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue("#ffffff", SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMaxpointWithValue("#6aa84f", SpreadsheetApp.InterpolationType.NUMBER, '1');
    
    var trueToGreen = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("TRUE").setBackground("#d9ead3");
    
    var trueToRed = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("TRUE").setBackground("#f4cccc");
    
    // Use the Jira issue icon colors for the issue types
    var storyToGreen = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Story").setFontColor("#79B84F").setBold(true);
    
    var bugToRed = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Bug").setFontColor("#E4493A").setBold(true);

    var taskToBlue = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Task").setFontColor("#4BADE7").setBold(true);
    
    this.sheets = [
      {
        'name': 'Summary',
        'row_creator': function (sprint_report) { return [sprint_report.get_sprint_summary()] },
        'columns': [
          { name: 'Board', field: 'board_name' },
          { name: 'Sprint', field: function (r) { return '=HYPERLINK("' + r.report_url + '", "' + r.sprint_name + '")'; }, width: 150 },
          { name: 'Start', field: 'sprint_start' },
          { name: 'End', field: 'sprint_end' },
          { name: 'Estimate % Completed', field: function (r) { return r.estimate_completed / r.estimate_committed; }, format: '0.0%', rule: percentWhiteToGreen },
          { name: 'Estimate Completed', field: 'estimate_completed' },
          { name: 'Estimate Commited', field: 'estimate_committed' },
          { name: 'Issues % Completed', field: function (r) { return r.issues_completed / r.issues_committed; }, format: '0.0%', rule: percentWhiteToGreen },
          { name: 'Issues Completed', field: 'issues_completed' },
          { name: 'Issues Commited', field: 'issues_committed' },
          { name: 'Issues Added', field: 'issues_added' },
          { name: 'Estimate Added', field: 'estimate_added' }
        ]
      },
      {
        'name': 'Detail',
        'row_creator': function (sprint_report) { return sprint_report.get_sprint_issues() },
        'additional_fields': function (sprint_report) { return sprint_report.get_sprint_summary() },
        'columns': [
          { name: 'Board', field: 'board_name' },
          { name: 'Sprint', field: function (i, r) { return '=HYPERLINK("' + r.report_url + '", "' + r.sprint_name + '")'; }, width: 150 },
          { name: 'Key', field: function (i) { return '=HYPERLINK("' + i.issue_link + '", "' + i.key + '")'; } },
          { name: 'Type', field: 'issue_type', width: 60, rules: [storyToGreen, bugToRed, taskToBlue] },
          { name: 'Summary', field: 'summary', width: 400 },
          { name: 'Status at Sprint End', field: 'final_status' },
          { name: 'Epic', field: function (i) { return i.epic_link ? '=HYPERLINK("' + i.epic_link + '", "' + i.epic_key + '")' : ""; } },
          { name: 'Epic Name', field: 'epic_name' },
          { name: 'Completed', field: 'completed', rule: trueToGreen },
          { name: 'Completed Outside Sprint', field: 'completed_outside_sprint' },
          { name: 'Dropped From Sprint', field: 'dropped_from_sprint', rule: trueToRed }, 
          { name: 'Added To Sprint', field: 'added_to_sprint', rule: trueToGreen },
          { name: 'Start Estimate', field: 'start_estimate' },
          { name: 'End Estimate', field: 'end_estimate' }
        ]
      }
    ];

    var now = new Date(); 
    this.sheet_namer = "" + (now.getMonth() + 1) + "/" + now.getDate() + " " + 
                       now.getHours() + ":" + ("0" + now.getMinutes()).slice (-2);      
  }
  
  SheetsReporter.prototype._make_sheet = function (prefix, fields) {
    var current_spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet_base_name = prefix + " " + this.sheet_namer;
    var sheet, sheet_disambiguate_number = 1, sheet_name = sheet_base_name;
    
    while (true) {
      sheet = current_spreadsheet.getSheetByName(sheet_name);
      if (!sheet) {
        sheet = current_spreadsheet.insertSheet(sheet_name, current_spreadsheet.getSheets().length);
        break;
      } 
      sheet_disambiguate_number++;
      sheet_name = sheet_base_name + " (" + sheet_disambiguate_number + ")";      
    }
        
    var header_row = fields.map(function (e) { return e.name });
    sheet.appendRow(header_row);
    
    var range = sheet.getRange(1, 1, 1, header_row.length);
    range.setBackground("#efefef"); // Light grey
    range.setTextStyle(SpreadsheetApp.newTextStyle().setBold(true).build());
    range.setWrap(true);
    
    sheet.setFrozenRows(1);
    
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].width) 
        sheet.setColumnWidth(i + 1, fields[i].width)
    }
      
    return sheet;
  }

  SheetsReporter.prototype._process_report = function (sheet, columns, lookup_rows, parent_lookup) {
    for (var i = 0; i < lookup_rows.length; i++) {
      var lookup_row = lookup_rows[i];
      var output_row = [];
      for (var j = 0; j < columns.length; j++) {
        var column = columns[j];
        var field_name = column.field;
        var value;
        if (typeof(field_name) == "function")
          value = field_name(lookup_row, parent_lookup)
        else if (field_name in lookup_row)
          value = lookup_row[field_name];
        else if (field_name in parent_lookup)
          value = parent_lookup[field_name];
        
        Logger.log("Field capture %s %s %s %s", column.name, field_name, typeof(value), value);
        if (value === undefined || value === null || (typeof(value) == "number" && isNaN(value)))
          value = "#N/A"; 
        
        output_row.push(value);
      }
      Logger.log(output_row);
      sheet.appendRow(output_row);
    }
    
    return sheet; 
  }
  
  SheetsReporter.prototype.finalize_report = function () {
    for (var i = 0; i < this.sheets.length; i++) {
      var sheet_maker = this.sheets[i];
      var sheet = sheet_maker.sheet;
    
      var rows = sheet.getLastRow();
      var columns = sheet.getLastColumn();
      var rules = [];
      
      // Apply conditional formatting rules
      for (var j = 0; j < sheet_maker.columns.length; j++) {
        var column = sheet_maker.columns[j];
        var range = sheet.getRange(2, j + 1, rows - 1, 1);
        
        var column_rules = column.rules || [];
        if (column.rule)
          column_rules.push(column.rule);
        
        if (column_rules.length) {
          var range = sheet.getRange(2, j + 1, rows - 1, 1);
          for (var k = 0; k < column_rules.length; k++) {
            var rule = column_rules[k].copy();
            rule.setRanges([range]);
            rules.push(rule.build());
          }
        }
        
        if (column.format) 
          range.setNumberFormat(column.format)
      }
            
      sheet.setConditionalFormatRules(rules);
      
      // Put filtering on
      var whole_sheet = sheet.getRange(1, 1, rows, columns);    
      if (whole_sheet.getFilter())
        whole_sheet.getFilter().remove();
      whole_sheet.createFilter();
    }                                
  }
    
  SheetsReporter.prototype.process_sprint = function (sprint_report) {
    for (var i = 0; i < this.sheets.length; i++) {
      var sheet_maker = this.sheets[i];
      var sheet = sheet_maker.sheet;
      if (!sheet_maker.sheet) {
        sheet = this._make_sheet(sheet_maker.name, sheet_maker.columns);
        sheet_maker.sheet = sheet;
      }
      this._process_report(sheet, sheet_maker.columns, sheet_maker.row_creator(sprint_report), 
                           sheet_maker.additional_fields && sheet_maker.additional_fields(sprint_report));
    }    
  }
  
  return SheetsReporter;
})();

function clearSheets(exclude_name) {
  var current_spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = current_spreadsheet.getSheets();
  for (var i = 1; i < sheets.length; i++) {
    if (exclude_name && sheets[i].getName() == exclude_name)
      continue;
    current_spreadsheet.deleteSheet(sheets[i]); 
  }
}

function columnToA(column) {
    var out = "";
    var remainder = column;
    while (true) {
        remainder = remainder - 1;
        out = String.fromCharCode("A".charCodeAt(0) + (remainder % 26)) + out;

        remainder = Math.floor(remainder / 26);
        if (!remainder)
            break;
    };
    return out;
} 

function rowColumnToA1(row, column) {
  return columnToA(column) + "" + row;
}

function runTest() {
  var reporter = new SheetsReporter();
  var report_boards = [157];
  clearSheets(INSTRUCTIONS_SHEET);
  var runner = new ReportRunner(getJiraOps());
  for (var i = 0; i < report_boards.length; i++) {
    //var report = runner.run_report_by_name(report_boards[i], 2, function (r) { reporter.process_sprint(r) });
    var report = runner.run_report_by_id(report_boards[i], 1, function (r) { reporter.process_sprint(r) });
  }
  reporter.finalize_report();
}  

function debug() {
  var current_spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = current_spreadsheet.getActiveSheet();
  var cell = sheet.getActiveCell();
  var val = cell.getValue()
  Logger.log(val);
//  var range = sheet.getRange(1, 1, 1, 10);
//  range.setBackground("grey");  
}
