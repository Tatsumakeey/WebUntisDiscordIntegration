import { WebUntis } from 'webuntis';
import axios from 'axios';
import cron from 'node-cron';


//cron.schedule('30 7 * * *', async () => {
    const timeTableData = await connectAndGetTimeTableData();
    await fetchTimeTableData();

async function connectAndGetTimeTableData(){
const untis = new WebUntis('Insert Class', 'Insert Username', 'Insert Password', 'insert webuntis url with school subdomain');

await untis.login();

//return await untis.getTimetableFor(Date.UTC(2023, 8 - 1, 7), 3782, 1, true);
//return await untis.getOwnTimetableFor(Date.UTC(2023, 6 - 1, 6));
return await untis.getOwnTimetableForToday();
}

async function fetchTimeTableData(){
    const startTimes = [745, 830, 935, 1020, 1125, 1210, 1315, 1400]; //This Array contains all startTimes. (1st - 8th lesson).

    let timeTableSig = []; //This Array will contain all Signatures from todays timetable. e.g. (POL_IAF21_GD)

    let teachers = []; /* This Array will contain the teachers Data from todays timetable. e.g. :
    [ { id: 130, name: 'HR', longname: 'Hermes' } ]
    */
   
    let rooms = []; /* This Array will contain all Rooms from todays timetable. e.g 
    [ { id: 21, name: 'B121', longname: 'PC-Raum' } ]
    */

    let subject = [] /* This Array will contain all Subjects from todays timetable. e.g.
    [ { id: 22, name: 'DBK', longname: 'Datenbanken' } ]
   */

    let timeTableEvent = [] /* This Array will contain all Events on the day, if there is no event
    on that current lesson, it will contain a null value.
    */

    let timeTableEventDescription = [] /* This Array contains the description from the timeTableEvent e.g.
    Individuelle Vorbereitung Test im eigenen Zeitfenster mit Material HN
    */

    let timeTableStartTimes = [] /*This array will include all the timeTableStartTimes, they are relative to the timetable
    and they are important for sorting out the values in an ascending order.
    */

    let webhookText = ''; //This will contain the whole text for the webhook to send.

    let timesAsText = ['7:45 - 8:30', '8:30 - 9:15', '9:35 - 10:20', '10:20 - 11:05', '11:25 - 12:10', '12:10 - 12:55', '13:15 - 14:00', '14:00 - 14:45'] //start-end times for the webhook text


    //Initializing the function to add values with a loop.
    async function initializeVariables(){
        for(let i = 0; i < timeTableData.length; i++){
            timeTableStartTimes.push(timeTableData[i].startTime);
            timeTableSig.push(timeTableData[i].sg);
            teachers.push(timeTableData[i].te);
            rooms.push(timeTableData[i].ro);
            subject.push(timeTableData[i].su);

            //Adds substitute event text to the timeTableEvent if its an substitute lesson.
            if(timeTableData[i].te[0].orgname !== undefined){
                timeTableEvent[i] = 'VERTRETUNG'

                //If substitute text exists, fill it in.
                if(timeTableData[i].substText !== undefined){
                  //Adding the substitute text with the fat format ("**")
                timeTableEventDescription.push("**" + timeTableData[i].substText + "**");
                }
                //if not fill in null.
                else{
                timeTableEventDescription.push(null);
                }
            }

            //Adds cancelled event text to the timeTableEvent if its an cancelled lesson.
            else if(timeTableData[i].code == 'cancelled'){
                timeTableEvent[i] = 'ENTFALL'
                timeTableEventDescription.push(null);
            }

            //Adds transfer event text to the timeTableEvent if its an transfered lesson.
            else if(timeTableData[i].code == 'irregular'){
                timeTableEvent[i] = 'VERLEGUNG'
                timeTableEventDescription.push(null);
            }

            //Pushes null value if no timetable event is happening in that current lesson.
            else{
                timeTableEvent.push(null);
                timeTableEventDescription.push(null);
            }
        }
    }

    //Initializing the function to sort all the arrays in the right order (ascending).
    async function sortLessonsAscending(){
        // Create an array of indices
        const indices = Array.from(timeTableStartTimes.keys());

        // Sort the indices based on the values of timeTableStartTime in an ascending order.
        indices.sort((a, b) => timeTableStartTimes[a] - timeTableStartTimes[b]);
        
        //initialize the variables in the right order
        timeTableSig = indices.map((index) => timeTableSig[index]);
        teachers = indices.map((index) => teachers[index]);
        rooms = indices.map((index) => rooms[index]);
        subject = indices.map((index) => subject[index]);
        timeTableEvent = indices.map((index) => timeTableEvent[index]);
        timeTableEventDescription = indices.map((index) => timeTableEventDescription[index]);
        timeTableStartTimes = indices.map((index) => timeTableStartTimes[index]);
    }

    //Initializing the function to add the missing lessons in the variables.
    async function addMissingLessons(){

        for (let time of startTimes) {
            // Find the right place to insert the time in the sorted timeTableStartTimes.
            let index = timeTableStartTimes.findIndex(t => t >= time);
          
            // If the time is not found (i.e., it doesn't exist in timeTableStartTimes), insert it.
            if (index === -1 || timeTableStartTimes[index] !== time) {
              // If the time is larger than all existing times, append it at the end.
              if (index === -1) index = timeTableStartTimes.length;
          
              // Insert the time and associated data at the found index.
              timeTableStartTimes.splice(index, 0, time);
              timeTableSig.splice(index, 0, 'FREI');
              teachers.splice(index, 0, null);
              rooms.splice(index, 0, null);
              subject.splice(index, 0, null);
              timeTableEvent.splice(index, 0, null);
              timeTableEventDescription.splice(index, 0, null);
            }
          }

    }

    async function removeInvalidLessons(){
      if (!Array.isArray(timeTableEvent)) {
          console.error('timeTableEvent must be an array');
          return;
      }
  
      let beforeIrregular = false;
      let afterRegular = false;
      let hamburgerRegular = false;
  
      let entfallIndexes = [];
  
      for(let i = 1; i < timeTableEvent.length - 2; i++){
          let beforeScheme = (timeTableEvent[i] == 'ENTFALL') && (timeTableEvent[i - 1] !== 'VERLEGUNG' && timeTableEvent[i + 1] == 'VERLEGUNG' && timeTableEvent[i + 2] == 'ENTFALL');
          let afterScheme = (timeTableEvent[i] == 'ENTFALL') && (timeTableEvent[i - 1] == 'VERLEGUNG' && timeTableEvent[i + 1] == 'VERLEGUNG' && timeTableEvent[i + 2] == 'ENTFALL');
          let hamburgerScheme = !(afterScheme || beforeScheme) && (timeTableEvent[i] == 'ENTFALL' && timeTableEvent[i + 1] == 'ENTFALL') && (timeTableEvent[i - 1] == 'VERLEGUNG' && timeTableEvent[i + 2] == 'VERLEGUNG');
  
          // Check for beforeIrregular scheme.
          if(beforeScheme){
              beforeIrregular = true;
              entfallIndexes.push(i, i + 2);
          }
          // Check for AfterIrregular scheme.
          else if(afterScheme){
              afterRegular = true;
              entfallIndexes.push(i, i + 2);
          }
          // Check for Hamburger scheme.
          else if(hamburgerScheme){
              hamburgerRegular = true;
              entfallIndexes.push(i, i + 1);
          }
      }
  
      entfallIndexes.sort((a, b) => b - a); // sort in descending order to prevent index shifting problem when deleting
  
      for(let i of entfallIndexes) {
          // use a helper function to remove the element at index i from each array
          removeIndex(timeTableEvent, i);
          removeIndex(timeTableSig, i);
          removeIndex(teachers, i);
          removeIndex(rooms, i);
          removeIndex(subject, i);
          removeIndex(timeTableEventDescription, i);
          removeIndex(timeTableStartTimes, i);
      }
  
      function removeIndex(arr, index) {
          if (Array.isArray(arr)) {
              arr.splice(index, 1);
          }
      }
  }

    //Initializing the function to build the text for the webhook post request.
    async function buildWebhookText(){
        for(let i = 0; i <= 7; i++){

        //Checking if the lesson is a normal lesson
        if(teachers[i] !== null && timeTableEvent[i] == null){
        webhookText += `${timesAsText[i]} | ${subject[i][0].longname} | ${rooms[i][0].name} | ${teachers[i][0].longname} | ${timeTableEvent[i] !== null ? `| ${timeTableEvent[i]}` : ''}\n\n`}

        //Checking if the lesson is cancelled
        else if(timeTableEvent[i] == 'ENTFALL'){
        webhookText += `~~${timesAsText[i]} | ${subject[i][0].longname} | ${rooms[i][0].name} | ${teachers[i][0].longname} ~~ | **${timeTableEvent[i]}**\n\n`}

        //Checking if the lesson is a moved lesson
        else if(timeTableEvent[i] == 'VERLEGUNG'){
          webhookText += `${timesAsText[i]} | ${subject[i][0].longname} | ${rooms[i][0].name} | ${teachers[i][0].longname} | **${timeTableEvent[i]}**\n\n`
        }

        //Checking if the lesson is a substitute lesson
        else if(timeTableEvent[i] == 'VERTRETUNG'){
          webhookText += `${timesAsText[i]} | ${subject[i][0].longname} | ${rooms[i][0].name} | ${teachers[i][0].longname} | **${timeTableEvent[i]}** | ${timeTableEventDescription[i]}\n\n`
        }
    
        //If the lesson is vacant, add only FREI.
        else{
        webhookText += `${timesAsText[i]} | FREI\n\n`}
        }
    }

    //Initializing the function to send the Discord Webhook via POST request.
    async function sendDiscordWebhook(){

        //Get the parameter for the POST request defined.
        const params = {
            "content": "Stundenplan für **HEUTE**",
            "embeds": [
              {
                "title": "",
                "description": ``,
                "color": 15165460,
                "footer": {
                  "text": ""
                }
              }
            ],
            "username": "[Insert the discord name for the webhook]",
            "avatar_url": "[avatar url for the webhook]",
            "attachments": []
          }
        
          // Send the Discord webhook
          axios.post('[Insert Webhook]', params)
            .then(response => {
              console.log('Webhook sent successfully.');
            })
            .catch(error => {
              console.error('Error sending webhook:', error);
            });
    }

    //Calling the function to add values with a loop.
    await initializeVariables();

    //Calling the function to sort all the arrays in the right order (ascending).
    await sortLessonsAscending();

    //Calling the function to add the missing lessons in the variables.
    await addMissingLessons();

    //Calling the function to remove the Invalid Lessons.
    await removeInvalidLessons();

    //Calling the function to build webhook text.
    await buildWebhookText();

    //Calling the function to send the Discord Webhook.
    await sendDiscordWebhook();

    //Outputting the data in the console.
    console.log(timeTableData);
    console.log(timeTableSig);
    console.log(timeTableStartTimes);
    console.log(startTimes);
    console.log(teachers);
    console.log(rooms);
    console.log(subject);
    console.log(timeTableEvent);
    console.log(timeTableEventDescription);
}//});