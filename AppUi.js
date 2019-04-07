var TOKEN_HIDDEN = "XXXXXXX";

/**
 * Runs when the document is opened.
 */
function onOpen() {
  boot();
}

/**
 * Runs when the addon is installed.
 */
function onInstall() {
  boot();
}

/**
 * Manual initialization
 */
function boot() {
  makeMenu();
  try {
    showSidebar();
  } catch (e) {
    Logger.log("Failed showing sidebar, %s", e);
  }  
}

/*
 * Login details stored in properties
 */
function getLoginDetails() {
  var prop = PropertiesService.getUserProperties();
  var ctx = {"user": prop.getProperty("JIRA_USER"), 
             "token": prop.getProperty("JIRA_PASS"),
             "instance": prop.getProperty("JIRA_INSTANCE")};
  return ctx;
}

/*
 * Sanitized login details that can be sent to client side
 * @return {Object} Object login details, password is replaced with a safe token
 */
function getSanitizedLoginDetails() {
  var ctx = getLoginDetails();
  if (ctx.token)
    ctx.token = TOKEN_HIDDEN;
  return ctx;
}

/* 
 * Test login details
 * @param {string} user - Username for the Jira instance
 * @param {string} token - API token for the instance
 * @param {string} instance - Instance hostname
 * @return {Object} Object with the instance and username details, will throw an exception if they don't work 
 */
function testLogin(user, token, instance) {
  var atl = new JiraOps(user, token, instance, false); 
  
  var status;
  try { 
    status = atl.session_status(); 
    Logger.log("Session status %s", status);
  } catch (e) {
    throw("Invalid Jira login details, " +  e);
  }
  
  return {instance: instance, name: status.name};
}  

/* 
 * Create a JiraOps object from the saved login details
 * @param {boolean} use_cache - Whether the JiraOps object should be set to use caching or not
 * @return {Object} JiraOps object
 */
function getJiraOps(use_cache) {
  var ctx = getLoginDetails();
  var atl = new JiraOps(ctx.user, ctx.token, ctx.instance, use_cache);
  return atl;
}

/* 
 * Test saved credentials
 */
function testSavedLogin() {
  var ctx = getLoginDetails();
  
  if (!ctx.user || !ctx.token || !ctx.instance) 
    throw("No Jira login details, please update");
  
  return testLogin(ctx.user, ctx.token, ctx.instance);
}  
  
/* 
 * Test new login details and save if they work
 * @param {string} user - Username for the Jira instance
 * @param {string} token - API token for the instance
 * @param {string} instance - Instance hostname
 * @return {Object} Object with the instance and username details, will throw an exception if they don't work
 */
function testAndSaveLoginDetails(user, token, instance) {
  var ctx = getLoginDetails();   
  
  // Replace hidden token sent to client side with 
  // reeal token
  if (token == TOKEN_HIDDEN) 
    token = ctx.token;
  
  var result = testLogin(user, token, instance);
  
  var prop = PropertiesService.getUserProperties();
  prop.setProperty("JIRA_USER", user);
  prop.setProperty("JIRA_PASS", token);
  prop.setProperty("JIRA_INSTANCE", instance);
  
  return result;
}

/* 
 * Get board list
 * @return {Object[]} The Scrum boards visible in the Jira instance
 */
function getBoardList() {
  var atl = getJiraOps();

  return atl.get_boards().filter(function (e) { 
    // Only scrum boards support sprints
    return e.type == "scrum"; 
  }).map(function (e) { 
    return { name: e["name"], id: e["id"] }; 
  });
} 

/**
 * Returns the contents of an HTML file.
 * @param {string} file The name of the file to retrieve.
 * @return {string} The content of the file.
 */
function include(file) {
  return HtmlService.createTemplateFromFile(file).evaluate().getContent();
}

/** 
 * Run the report for a list of board ids
 * @param {Object} report_params - Configuration parameters for the report 
 */
function generateReport(report_params) {
  // report_params.board_ids = [148, 158, 160, 119, 145, 157, 162, 156, 143];

  var reporter = new SheetsReporter();  
  var board_ids = report_params.board_ids;
  var sprint_count = report_params.sprint_count;
  var delete_old = report_params.delete_old;
  var use_cache = report_params.use_cache;
  
  // Save these settings as defaults for next time
  PropertiesService.getUserProperties().setProperty("report_defaults", JSON.stringify(report_params));
  
  var atl = getJiraOps(use_cache);

  if (delete_old)
    clearSheets(INSTRUCTIONS_SHEET);
  
  var runner = new ReportRunner(atl);
  for (var i = 0; i < board_ids.length; i++) {
    var report = runner.run_report_by_id(board_ids[i], sprint_count, function (r) { 
      reporter.process_sprint(r) 
    });
  }
  reporter.finalize_report();
}


/** 
 * Create the menu items
 */
function makeMenu() {  
  SpreadsheetApp.getUi().createMenu('Jira Reporting')
  //  .addItem('Login to Jira', 'loginToJiraModal')
    .addItem('Show reporing sidebar', 'showSidebar')
    .addToUi();
}

/**
 * Show the sidebar.
 */
function showSidebar() {
  var sidebarTemplate = HtmlService.createTemplateFromFile('Sidebar')
  
  var report_defaults = PropertiesService.getUserProperties().getProperty("report_defaults");
  if (report_defaults) 
    report_defaults = JSON.parse(report_defaults);
  
  sidebarTemplate.ctx = getSanitizedLoginDetails();
  sidebarTemplate.report_defaults = report_defaults;
  
  var template = sidebarTemplate.evaluate()
    .setSandboxMode(HtmlService.SandboxMode.NATIVE)
    .setTitle('Jira Reporting')
    .setWidth(350)
    
  SpreadsheetApp.getUi().showSidebar(template);
}
