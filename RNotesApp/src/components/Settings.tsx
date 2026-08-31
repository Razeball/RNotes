import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import '../styles/Settings.css';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import type { PageSize } from '../models/pageModel';
import { Trans } from 'react-i18next';
import { SUPPORTED_LANGUAGES, 	activatePreferredUserLanguage } from '../i18n';
export type ViewMode = 'notepad' | 'document';

export interface AppSettings {
  autoSaveEnabled: boolean;
  autoSaveInterval: 5 | 10 | 30;
  showUnsavedWarning: boolean;
  showTypeSpeed: boolean;
  pageSize: PageSize;
  restoreSession: boolean;
  markdownEnabled: boolean;
  language: string;
  spellcheckEnabled: boolean;
  spellcheckLanguage: string;
}

export const defaultSettings: AppSettings = {
  autoSaveEnabled: false,
  autoSaveInterval: 5,
  showUnsavedWarning: true,
  showTypeSpeed: false,
  pageSize: 'letter',
  restoreSession: false,
  markdownEnabled: false,
  language: '',
  spellcheckEnabled: true,
  spellcheckLanguage: '',
};

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onRequestSave: () => Promise<boolean>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  headerEnabled: boolean;
  footerEnabled: boolean;
  onHeaderEnabledChange: (enabled: boolean) => void;
  onFooterEnabledChange: (enabled: boolean) => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, settings, onSettingsChange, onRequestSave, viewMode, onViewModeChange, headerEnabled, footerEnabled, onHeaderEnabledChange, onFooterEnabledChange }) => {
  const { t } = useTranslation();
  const [expandedLicense, setExpandedLicense] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const APACHE_2_0 = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License.

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to the Licensor for inclusion in the Work by the copyright owner.

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

(a) You must give any other recipients of the Work or Derivative Works a copy of this License; and
(b) You must cause any modified files to carry prominent notices stating that You changed the files; and
(c) You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work; and
(d) If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

8. Limitation of Liability. In no event and under no legal theory shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License.

END OF TERMS AND CONDITIONS

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.`;

  const licenses = [
    {
      name: 'Arimo',
      type: 'Apache License 2.0',
      description: t("An innovative, refreshing sans serif design that is metrically compatible with Arial."),
      text: APACHE_2_0,
    },
    {
      name: 'Tinos',
      type: 'Apache License 2.0',
      description: t("A serif typeface that is metrically compatible with Times New Roman."),
      text: APACHE_2_0,
    },
    {
      name: 'Hunspell en_US',
      type: 'SCOWL (BSD-style)',
      description: t("English dictionary used by the spelling checker."),
      text: `en_US Hunspell Dictionary
Version 2020.12.07
Mon Dec 7 20:14:35 2020 -0500 [5ef55f9]
http://wordlist.sourceforge.net

README file for English Hunspell dictionaries derived from SCOWL.

These dictionaries are created using the speller/make-hunspell-dict
script in SCOWL.

The following dictionaries are available:

  en_US (American)
  en_CA (Canadian)
  en_GB-ise (British with "ise" spelling)
  en_GB-ize (British with "ize" spelling)
  en_AU (Australian)

  en_US-large
  en_CA-large
  en_GB-large (with both "ise" and "ize" spelling)
  en_AU-large

The normal (non-large) dictionaries correspond to SCOWL size 60 and,
to encourage consistent spelling, generally only include one spelling
variant for a word.  The large dictionaries correspond to SCOWL size
70 and may include multiple spelling for a word when both variants are
considered almost equal.  The larger dictionaries however (1) have not
been as carefully checked for errors as the normal dictionaries and
thus may contain misspelled or invalid words; and (2) contain
uncommon, yet valid, words that might cause problems as they are
likely to be misspellings of more common words (for example, "ort" and
"calender").

To get an idea of the difference in size, here are 25 random words
only found in the large dictionary for American English:

  Bermejo Freyr's Guenevere Hatshepsut Nottinghamshire arrestment
  crassitudes crural dogwatches errorless fetial flaxseeds godroon
  incretion jalapeño's kelpie kishkes neuroglias pietisms pullulation
  stemwinder stenoses syce thalassic zees

The en_US, en_CA and en_AU are the official dictionaries for Hunspell.
The en_GB and large dictionaries are made available on an experimental
basis.  If you find them useful please send me a quick email at
kevina@gnu.org.

If none of these dictionaries suite you (for example, maybe you want
the normal dictionary that also includes common variants) additional
dictionaries can be generated at http://app.aspell.net/create or by
modifying speller/make-hunspell-dict in SCOWL.  Please do let me know
if you end up publishing a customized dictionary.

If a word is not found in the dictionary or a word is there you think
shouldn't be, you can lookup the word up at http://app.aspell.net/lookup
to help determine why that is.

General comments on these list can be sent directly to me at
kevina@gnu.org or to the wordlist-devel mailing lists
(https://lists.sourceforge.net/lists/listinfo/wordlist-devel).  If you
have specific issues with any of these dictionaries please file a bug
report at https://github.com/kevina/wordlist/issues.

IMPORTANT CHANGES INTRODUCED In 2016.11.20:

New Australian dictionaries thanks to the work of Benjamin Titze
(btitze@protonmail.ch).

IMPORTANT CHANGES INTRODUCED IN 2016.04.24:

The dictionaries are now in UTF-8 format instead of ISO-8859-1.  This
was required to handle smart quotes correctly.

IMPORTANT CHANGES INTRODUCED IN 2016.01.19:

"SET UTF8" was changes to "SET UTF-8" in the affix file as some
versions of Hunspell do not recognize "UTF8".

ADDITIONAL NOTES:

The NOSUGGEST flag was added to certain taboo words.  While I made an
honest attempt to flag the strongest taboo words with the NOSUGGEST
flag, I MAKE NO GUARANTEE THAT I FLAGGED EVERY POSSIBLE TABOO WORD.
The list was originally derived from Németh László, however I removed
some words which, while being considered taboo by some dictionaries,
are not really considered swear words in today's society.

COPYRIGHT, SOURCES, and CREDITS:

The English dictionaries come directly from SCOWL
and is thus under the same copyright of SCOWL.  The affix file is
a heavily modified version of the original english.aff file which was
released as part of Geoff Kuenning's Ispell and as such is covered by
his BSD license.  Part of SCOWL is also based on Ispell thus the
Ispell copyright is included with the SCOWL copyright.

The collective work is Copyright 2000-2018 by Kevin Atkinson as well
as any of the copyrights mentioned below:

  Copyright 2000-2018 by Kevin Atkinson

  Permission to use, copy, modify, distribute and sell these word
  lists, the associated scripts, the output created from the scripts,
  and its documentation for any purpose is hereby granted without fee,
  provided that the above copyright notice appears in all copies and
  that both that copyright notice and this permission notice appear in
  supporting documentation. Kevin Atkinson makes no representations
  about the suitability of this array for any purpose. It is provided
  "as is" without express or implied warranty.

Alan Beale <biljir@pobox.com> also deserves special credit as he has,
in addition to providing the 12Dicts package and being a major
contributor to the ENABLE word list, given me an incredible amount of
feedback and created a number of special lists (those found in the
Supplement) in order to help improve the overall quality of SCOWL.

The 10 level includes the 1000 most common English words (according to
the Moby (TM) Words II [MWords] package), a subset of the 1000 most
common words on the Internet (again, according to Moby Words II), and
frequently class 16 from Brian Kelk's "UK English Wordlist
with Frequency Classification".

The MWords package was explicitly placed in the public domain:

    The Moby lexicon project is complete and has
    been place into the public domain. Use, sell,
    rework, excerpt and use in any way on any platform.

    Placing this material on internal or public servers is
    also encouraged. The compiler is not aware of any
    export restrictions so freely distribute world-wide.

    You can verify the public domain status by contacting

    Grady Ward
    3449 Martha Ct.
    Arcata, CA  95521-4884

    grady@netcom.com
    grady@northcoast.com

The "UK English Wordlist With Frequency Classification" is also in the
Public Domain:

  Date: Sat, 08 Jul 2000 20:27:21 +0100
  From: Brian Kelk <Brian.Kelk@cl.cam.ac.uk>

  > I was wondering what the copyright status of your "UK English
  > Wordlist With Frequency Classification" word list as it seems to
  > be lacking any copyright notice.

  There were many many sources in total, but any text marked
  "copyright" was avoided. Locally-written documentation was one
  source. An earlier version of the list resided in a filespace called
  PUBLIC on the University mainframe, because it was considered public
  domain.

  Date: Tue, 11 Jul 2000 19:31:34 +0100

  > So are you saying your word list is also in the public domain?

  That is the intention.

The 20 level includes frequency classes 7-15 from Brian's word list.

The 35 level includes frequency classes 2-6 and words appearing in at
least 11 of 12 dictionaries as indicated in the 12Dicts package.  All
words from the 12Dicts package have had likely inflections added via
my inflection database.

The 12Dicts package and Supplement is in the Public Domain.

The WordNet database, which was used in the creation of the
Inflections database, is under the following copyright:

  This software and database is being provided to you, the LICENSEE,
  by Princeton University under the following license.  By obtaining,
  using and/or copying this software and database, you agree that you
  have read, understood, and will comply with these terms and
  conditions.:

  Permission to use, copy, modify and distribute this software and
  database and its documentation for any purpose and without fee or
  royalty is hereby granted, provided that you agree to comply with
  the following copyright notice and statements, including the
  disclaimer, and that the same appear on ALL copies of the software,
  database and documentation, including modifications that you make
  for internal use or for distribution.

  WordNet 1.6 Copyright 1997 by Princeton University.  All rights
  reserved.

  THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON
  UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
  IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON
  UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-
  ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
  LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY
  THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.

  The name of Princeton University or Princeton may not be used in
  advertising or publicity pertaining to distribution of the software
  and/or database.  Title to copyright in this software, database and
  any associated documentation shall at all times remain with
  Princeton University and LICENSEE agrees to preserve same.

The 40 level includes words from Alan's 3esl list found in version 4.0
of his 12dicts package.  Like his other stuff the 3esl list is also in the
public domain.

The 50 level includes Brian's frequency class 1, words appearing
in at least 5 of 12 of the dictionaries as indicated in the 12Dicts
package, and uppercase words in at least 4 of the previous 12
dictionaries.  A decent number of proper names is also included: The
top 1000 male, female, and Last names from the 1990 Census report; a
list of names sent to me by Alan Beale; and a few names that I added
myself.  Finally a small list of abbreviations not commonly found in
other word lists is included.

The name files form the Census report is a government document which I
don't think can be copyrighted.

The file special-jargon.50 uses common.lst and word.lst from the
"Unofficial Jargon File Word Lists" which is derived from "The Jargon
File".  All of which is in the Public Domain.  This file also contain
a few extra UNIX terms which are found in the file "unix-terms" in the
special/ directory.

The 55 level includes words from Alan's 2of4brif list found in version
4.0 of his 12dicts package.  Like his other stuff the 2of4brif is also
in the public domain.

The 60 level includes all words appearing in at least 2 of the 12
dictionaries as indicated by the 12Dicts package.

The 70 level includes Brian's frequency class 0 and the 74,550 common
dictionary words from the MWords package.  The common dictionary words,
like those from the 12Dicts package, have had all likely inflections
added.  The 70 level also included the 5desk list from version 4.0 of
the 12Dics package which is in the public domain.

The 80 level includes the ENABLE word list, all the lists in the
ENABLE supplement package (except for ABLE), the "UK Advanced Cryptics
Dictionary" (UKACD), the list of signature words from the YAWL package,
and the 10,196 places list from the MWords package.

The ENABLE package, mainted by M\\Cooper <thegrendel@theriver.com>,
is in the Public Domain:

  The ENABLE master word list, WORD.LST, is herewith formally released
  into the Public Domain. Anyone is free to use it or distribute it in
  any manner they see fit. No fee or registration is required for its
  use nor are "contributions" solicited (if you feel you absolutely
  must contribute something for your own peace of mind, the authors of
  the ENABLE list ask that you make a donation on their behalf to your
  favorite charity). This word list is our gift to the Scrabble
  community, as an alternate to "official" word lists. Game designers
  may feel free to incorporate the WORD.LST into their games. Please
  mention the source and credit us as originators of the list. Note
  that if you, as a game designer, use the WORD.LST in your product,
  you may still copyright and protect your product, but you may *not*
  legally copyright or in any way restrict redistribution of the
  WORD.LST portion of your product. This *may* under law restrict your
  rights to restrict your users' rights, but that is only fair.

UKACD, by J Ross Beresford <ross@bryson.demon.co.uk>, is under the
following copyright:

  Copyright (c) J Ross Beresford 1993-1999. All Rights Reserved.

  The following restriction is placed on the use of this publication:
  if The UK Advanced Cryptics Dictionary is used in a software package
  or redistributed in any form, the copyright notice must be
  prominently displayed and the text of this document must be included
  verbatim.

  There are no other restrictions: I would like to see the list
  distributed as widely as possible.

The 95 level includes the 354,984 single words, 256,772 compound
words, 4,946 female names and the 3,897 male names, and 21,986 names
from the MWords package, ABLE.LST from the ENABLE Supplement, and some
additional words found in my part-of-speech database that were not
found anywhere else.

Accent information was taken from UKACD.

The VarCon package was used to create the American, British, Canadian,
and Australian word list.  It is under the following copyright:

  Copyright 2000-2016 by Kevin Atkinson

  Permission to use, copy, modify, distribute and sell this array, the
  associated software, and its documentation for any purpose is hereby
  granted without fee, provided that the above copyright notice appears
  in all copies and that both that copyright notice and this permission
  notice appear in supporting documentation. Kevin Atkinson makes no
  representations about the suitability of this array for any
  purpose. It is provided "as is" without express or implied warranty.

  Copyright 2016 by Benjamin Titze

  Permission to use, copy, modify, distribute and sell this array, the
  associated software, and its documentation for any purpose is hereby
  granted without fee, provided that the above copyright notice appears
  in all copies and that both that copyright notice and this permission
  notice appear in supporting documentation. Benjamin Titze makes no
  representations about the suitability of this array for any
  purpose. It is provided "as is" without express or implied warranty.

  Since the original words lists come from the Ispell distribution:

  Copyright 1993, Geoff Kuenning, Granada Hills, CA
  All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions
  are met:

  1. Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.
  2. Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in the
     documentation and/or other materials provided with the distribution.
  3. All modifications to the source code must be clearly marked as
     such.  Binary redistributions based on modified source code
     must be clearly marked as modified versions in the documentation
     and/or other materials provided with the distribution.
  (clause 4 removed with permission from Geoff Kuenning)
  5. The name of Geoff Kuenning may not be used to endorse or promote
     products derived from this software without specific prior
     written permission.

  THIS SOFTWARE IS PROVIDED BY GEOFF KUENNING AND CONTRIBUTORS \`\`AS IS'' AND
  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED.  IN NO EVENT SHALL GEOFF KUENNING OR CONTRIBUTORS BE LIABLE
  FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
  OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
  OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
  SUCH DAMAGE.

Build Date: Mon Dec  7 20:19:27 EST 2020
Wordlist Command: mk-list --accents=strip en_US 60`,
    },
    {
      name: 'Hunspell es',
      type: 'MPL 1.1 / GPL 3.0+ / LGPL 3.0+',
      description: t("Spanish dictionary used by the spelling checker. RNotes uses it under the MPL 1.1 option."),
      text: `****************************************************************************
  **                                                                        **
  **          Diccionario para corrección ortográfica en español de         **
  **                      LibreOffice/Apache OpenOffice                     **
  **                                                                        **
  ****************************************************************************

Para: es_ES

  ****************************************************************************

                                  Versión 2.8

SUMARIO

1. AUTOR
2. LICENCIA
3. COLABORACIÓN
4. AGRADECIMIENTOS


1. AUTOR

   Este diccionario ha sido desarrollado inicialmente por Santiago Bosio;
quien actualmente coordina el desarrollo de todos los diccionarios localizados.

   El diccionario es un desarrollo completamente nuevo, y NO ESTÁ BASADO en el
trabajo de Jesús Carretero y Santiago Rodríguez, ni en la versión adaptada al
formato de MySpell por Richard Holt.

2. LICENCIA

   Este diccionario para corrección ortográfica, integrado por el fichero
de afijos y la lista de palabras (es_ES[.aff|.dic]) se distribuye
bajo un triple esquema de licencias disjuntas: GNU GPL versión 3 o posterior,
GNU LGPL versión 3 o posterior, ó MPL versión 1.1 o posterior. Puede
seleccionar libremente bajo cuál de estas licencias utilizará este diccionario.
En el fichero LICENSE.md encontrá más detalles.

3. COLABORACIÓN

   Este diccionario es resultado del trabajo colaborativo de muchas personas.
La buena noticia es que ¡usted también puede participar!

   ¿Tiene dudas o sugerencias? ¿Desearía ver palabras agregadas, o que se
realizaran correcciones? Consulte las indicaciones técnicas publicadas en
CONTRIBUTING.md. Estaremos encantados de atenderle.

4. AGRADECIMIENTOS

   Hay varias personas que han colaborado con aportes o sugerencias a la
creación de este diccionario. Se agradece especialmente a:

   - Richard Holt.
   - Marcelo Garrone.
   - Kevin Hendricks.
   - Juan Rey Saura.
   - Carlos Dávila.
   - Román Gelbort.
   - J. Eduardo Moreno.
   - Gonzalo Higuera Díaz.
   - Ricardo Palomares Martínez.
   - Sergio Medina.
   - Ismael Olea.
   - Alejandro Moreno.
   - Alexandro Colorado.
   - Andrés Sánchez.
   - Juan Rafael Fernández García.
   - eksperimental.
   - Ezequiel (ezeperez26).
   - KNTRO.
   - Ricardo Berlasso.
   - Edward Villegas-Pulgarin (cosmocalibur)
   - y a todos los integrantes de la comunidad en español que proponen mejoras
     a este diccionario.`,
    },
  ];

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    onSettingsChange(newSettings);
    if (key === 'language') 	activatePreferredUserLanguage(newSettings.language);
    invoke("update_settings", { settings: {
      auto_save_enabled: newSettings.autoSaveEnabled,
      auto_save_interval: newSettings.autoSaveInterval,
      show_unsaved_warning: newSettings.showUnsavedWarning,
      show_type_speed: newSettings.showTypeSpeed,
      page_size: newSettings.pageSize,
      restore_session: newSettings.restoreSession,
      markdown_enabled: newSettings.markdownEnabled,
      language: newSettings.language,
      spellcheck_enabled: newSettings.spellcheckEnabled,
      spellcheck_language: newSettings.spellcheckLanguage,
    }}).catch((err) => console.error("Failed to save settings:", err));
  };

  const handleAutoSaveToggle = async (checked: boolean) => {
    if (checked) {
      const saved = await onRequestSave();
      if (!saved) return;
    }
    updateSetting('autoSaveEnabled', checked);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("Settings")}>
      <div className="settings-panel">
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Auto Save")}</span>
              <span className="settings-description">
                {t("Automatically save the document at a regular interval. The file must be saved first to set a location.")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.autoSaveEnabled}
                onChange={(e) => handleAutoSaveToggle(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          {settings.autoSaveEnabled && (
            <div className="settings-row sub-setting">
              <span className="settings-label">{t("Save interval")}</span>
              <div className="interval-options">
                {([5, 10, 30] as const).map((interval) => (
                  <button
                    key={interval}
                    className={`interval-button ${settings.autoSaveInterval === interval ? 'active' : ''}`}
                    onClick={() => updateSetting('autoSaveInterval', interval)}
                  >
                    {t('{{count}} min', { count: interval })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Unsaved Changes Warning")}</span>
              <span className="settings-description">
                {t("Show a confirmation dialog when closing a tab or the app with unsaved changes")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.showUnsavedWarning}
                onChange={(e) => updateSetting('showUnsavedWarning', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Restore Previous Session")}</span>
              <span className="settings-description">
                {t("Reopen the tabs that were open in the previous session when the app starts")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.restoreSession}
                onChange={(e) => updateSetting('restoreSession', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Markdown Formatting")}</span>
              <span className="settings-description">
                <Trans
                  i18nKey="Render markdown as you type and when pasting. Turn this off to keep the markers as literal text. For a fuller guide see <0>the Markdown guide</0>."
                  components={[
                    <a
                      key="guide"
                      href="https://www.markdownguide.org/basic-syntax/"
                      target="_blank"
                      rel="noopener noreferrer"
                    />,
                  ]}
                />
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.markdownEnabled}
                onChange={(e) => updateSetting('markdownEnabled', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Show Type Speed")}</span>
              <span className="settings-description">
                {t("Display average typing speed (WPM) in the status bar")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.showTypeSpeed}
                onChange={(e) => updateSetting('showTypeSpeed', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">
                {t('Document View Mode')}
                <span
                  title="Ctrl+D"
                  style={{
                    marginLeft: '8px',
                    fontSize: '11px',
                    color: '#aaa',
                    backgroundColor: '#3a3a3a',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    padding: '1px 6px',
                    fontFamily: 'monospace',
                    verticalAlign: 'middle',
                  }}
                >
                  Ctrl+D
                </span>
              </span>
              <span className="settings-description">
                {t("Switch between a continuous notepad editor and a paginated document view")}</span>
            </div>
            <div className="view-mode-options">
              <button
                className={`interval-button ${viewMode === 'notepad' ? 'active' : ''}`}
                onClick={() => onViewModeChange('notepad')}
              >
                {t("Notepad")}</button>
              <button
                className={`interval-button ${viewMode === 'document' ? 'active' : ''}`}
                onClick={() => onViewModeChange('document')}
              >
                {t("Document")}</button>
            </div>
          </div>
          {viewMode === 'document' && (
            <>
              <div className="settings-row sub-setting">
                <div className="settings-info">
                  <span className="settings-label">{t("Page Size")}</span>
                  <span className="settings-description">
                    {t("Choose the page size for the document layout and printing")}</span>
                </div>
                <div className="view-mode-options">
                  {(['letter', 'a4', 'legal'] as const).map((size) => (
                    <button
                      key={size}
                      className={`interval-button ${settings.pageSize === size ? 'active' : ''}`}
                      onClick={() => updateSetting('pageSize', size)}
                    >
                      {size === 'letter' ? t("Letter") : size === 'a4' ? 'A4' : t("Legal")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row sub-setting">
                <div className="settings-info">
                  <span className="settings-label">{t("Header")}</span>
                  <span className="settings-description">
                    {t("Show a header at the top of each page. Double-click in the header area to edit.")}</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={headerEnabled}
                    onChange={(e) => onHeaderEnabledChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              <div className="settings-row sub-setting">
                <div className="settings-info">
                  <span className="settings-label">{t("Footer")}</span>
                  <span className="settings-description">
                    {t("Show a footer at the bottom of each page. Double-click in the footer area to edit.")}</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={footerEnabled}
                    onChange={(e) => onFooterEnabledChange(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Language")}</span>
              <span className="settings-description">
                {t("Interface language. Follows the system by default.")}</span>
            </div>
            <div className="view-mode-options">
              <button
                className={`interval-button ${settings.language === '' ? 'active' : ''}`}
                onClick={() => updateSetting('language', '')}
              >
                {t("System")}</button>
              {SUPPORTED_LANGUAGES.map((language) => (
                <button
                  key={language.code}
                  className={`interval-button ${settings.language === language.code ? 'active' : ''}`}
                  onClick={() => updateSetting('language', language.code)}
                >
                  {language.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-info">
              <span className="settings-label">{t("Licenses")}</span>
              <span className="settings-description">
                {t("Open source licenses for fonts and libraries used in this application")}</span>
            </div>
          </div>
          {licenses.map((license) => (
            <div key={license.name} className="license-entry">
              <button
                className="license-header"
                onClick={() => setExpandedLicense(expandedLicense === license.name ? null : license.name)}
              >
                <div className="license-header-info">
                  <span className="license-name">{license.name}</span>
                  <span className="license-type">{license.type}</span>
                </div>
                <span className={`license-chevron ${expandedLicense === license.name ? 'expanded' : ''}`}>&#9654;</span>
              </button>
              {expandedLicense === license.name && (
                <div className="license-content">
                  <p className="license-description">{license.description}</p>
                  <pre className="license-text">{license.text}</pre>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="settings-version">
          {t('v{{version}}', { version: appVersion })}
        </div>
      </div>
    </Modal>
  );
};

export default Settings;
